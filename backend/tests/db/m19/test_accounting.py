"""M19 accounting on the real backend (NEX-206): lists and order, balanced journal posting, errors in the mock's
order, the database balance check, forced RLS and insert-only journal entries."""

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.modules.m19.models import Budget, JournalEntry, LedgerAccount
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

API = "/api/v1/"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
MODELS = (LedgerAccount, JournalEntry, Budget)
ENTRY: dict[str, Any] = {
    "institutionId": "ins-ls",
    "postedOn": "2026-06-01",
    "reference": "JV-1",
    "currency": "INR",
    "lines": [
        {"accountId": "m19-cash", "debit": 500, "credit": 0},
        {"accountId": "m19-fees", "debit": 0, "credit": 500},
    ],
}
SEEDED_LINES = [{"accountId": "m19-cash", "debit": 1, "credit": 0}, {"accountId": "m19-fees", "debit": 0, "credit": 1}]


def csrf(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


@pytest.fixture
def ledger(test_db: DbUrls) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        for account, code, kind, active, institution in (
            ("m19-cash", "1001", "asset", True, "ins-ls"),
            ("m19-fees", "4001", "income", True, "ins-ls"),
            ("m19-old", "4999", "income", False, "ins-ls"),
        ):
            conn.execute(
                text(
                    "INSERT INTO ledger_accounts (id, tenant_id, institution_id, code, name, kind, active) "
                    "VALUES (:id, 'ten-ls', :ins, :code, 'Account', :kind, :active)"
                ),
                {"id": account, "ins": institution, "code": code, "kind": kind, "active": active},
            )
        conn.execute(
            text(
                "INSERT INTO journal_entries (id, tenant_id, institution_id, posted_on, reference, currency, lines, "
                "source) VALUES ('m19-je-old', 'ten-ls', 'ins-ls', '2026-05-01', 'OPEN', 'INR', CAST(:l AS jsonb), "
                "'import')"
            ),
            {"l": json.dumps(SEEDED_LINES)},
        )
        conn.execute(
            text(
                "INSERT INTO budgets (id, tenant_id, institution_id, academic_year_id, currency, lines, status) "
                "VALUES ('m19-budget', 'ten-ls', 'ins-ls', 'cal-ls-2026', 'INR', CAST(:l AS jsonb), 'draft')"
            ),
            {"l": json.dumps([{"accountId": "m19-fees", "amount": 100000}])},
        )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM journal_entries WHERE lines::text LIKE '%m19-%'"))
            conn.execute(text("DELETE FROM budgets WHERE id = 'm19-budget'"))
            conn.execute(text("DELETE FROM ledger_accounts WHERE id LIKE 'm19-%'"))
        engine.dispose()


def mine(res: Any) -> list[dict[str, Any]]:
    assert res.status_code == 200, res.text
    return [row for row in res.json()["items"] if row["id"].startswith(("m19-", "je-"))]


def test_lists_and_posting(client: TestClient, kc: FakeKeycloak, ledger: Engine) -> None:
    sign_in(client, kc)
    accounts = mine(client.get(API + "ledger-accounts", params={"pageSize": 100}))
    assert [a["id"] for a in accounts] == ["m19-cash", "m19-fees", "m19-old"] and accounts[0]["parentId"] is None
    assert [b["id"] for b in mine(client.get(API + "budgets"))] == ["m19-budget"]
    res = client.post(API + "journal-entries", json=ENTRY, headers=csrf(client))
    assert res.status_code == 201, res.text
    entry = res.json()
    assert entry == {
        **ENTRY,
        "id": entry["id"],
        "tenantId": "ten-ls",
        "source": "manual",
        "createdAt": entry["createdAt"],
    }
    assert entry["id"].startswith("je-")
    listed = mine(client.get(API + "journal-entries", params={"pageSize": 100}))
    assert [e["id"] for e in listed][:2] == [entry["id"], "m19-je-old"]  # newest first
    with ledger.connect() as conn:
        changes = conn.scalar(
            text("SELECT changes FROM audit_events WHERE action = 'm19.journalEntry.created' AND target_id = :id"),
            {"id": entry["id"]},
        )
    assert {c["field"] for c in changes} == set(ENTRY) and "JV-1" not in json.dumps(changes)


def test_invalid_entries(client: TestClient, kc: FakeKeycloak, ledger: Engine) -> None:
    sign_in(client, kc)
    lines = ENTRY["lines"]
    fields: list[tuple[dict[str, Any], list[str]]] = [
        ({"lines": [lines[0], {**lines[1], "credit": 400}]}, ["lines"]),  # unbalanced
        ({"lines": [{**lines[0], "credit": 500}, lines[1]]}, ["lines"]),  # both sides
        ({"lines": [{**lines[0], "debit": 0}, {**lines[1], "credit": 0}]}, ["lines"]),  # zero lines
        ({"lines": [lines[0]]}, ["lines"]),
        ({"currency": "XXY", "postedOn": "2026-6-1"}, ["postedOn", "currency"]),
        ({"reference": "  "}, ["reference"]),
    ]
    for change, paths in fields:
        res = client.post(API + "journal-entries", json={**ENTRY, **change}, headers=csrf(client))
        assert res.status_code == 400, change
        assert [d["path"] for d in res.json()["error"]["details"]] == paths, change
    for body in (json.dumps({**ENTRY, "extra": 1}), "{"):
        res = client.post(
            API + "journal-entries", content=body, headers={**csrf(client), "content-type": "application/json"}
        )
        assert res.status_code == 400 and "details" not in res.json()["error"]
    references: list[tuple[dict[str, Any], str, str]] = [
        ({"institutionId": "ins-rv"}, "institutionId", "Invalid institution"),
        (
            {"lines": [{**lines[0], "accountId": "m19-old"}, lines[1]]},
            "lines",
            "Choose active accounts for the selected institution",
        ),
        (
            {"lines": [{**lines[0], "accountId": "m19-nope"}, lines[1]]},
            "lines",
            "Choose active accounts for the selected institution",
        ),
    ]
    for change, path, message in references:
        res = client.post(API + "journal-entries", json={**ENTRY, **change}, headers=csrf(client))
        assert res.status_code == 400 and res.json()["error"]["details"] == [{"path": path, "message": message}]


def test_guard_order(client: TestClient, kc: FakeKeycloak, ledger: Engine) -> None:
    sign_in(client, kc, **TEACHER)  # no M19 permissions
    assert client.get(API + "ledger-accounts").status_code == 403
    assert client.post(API + "journal-entries", content="{", headers=csrf(client)).status_code == 403
    sign_in(client, kc)
    switch = text("UPDATE entitlements SET source = :s, enabled = :e WHERE tenant_id = 'ten-ls' AND module_id = 'M19'")
    with ledger.begin() as conn:
        conn.execute(switch, {"s": "plan", "e": False})
    try:
        for res in (
            client.get(API + "budgets"),
            client.post(API + "journal-entries", content="{", headers=csrf(client)),
        ):
            assert res.status_code == 403 and res.json()["error"]["code"] == "module_disabled"
    finally:
        with ledger.begin() as conn:
            conn.execute(switch, {"s": "core", "e": True})


def test_balance_check_rls_grants_and_models(test_db: DbUrls, ledger: Engine) -> None:
    unbalanced = [
        {"accountId": "m19-cash", "debit": 2, "credit": 0},
        {"accountId": "m19-fees", "debit": 0, "credit": 1},
    ]
    with ledger.connect() as conn:
        for lines in (unbalanced, SEEDED_LINES[:1], [{"accountId": "x", "debit": "1", "credit": 0}] * 2):
            with pytest.raises(DBAPIError), conn.begin():
                conn.execute(
                    text("UPDATE journal_entries SET lines = CAST(:l AS jsonb) WHERE id = 'm19-je-old'"),
                    {"l": json.dumps(lines)},
                )
        with pytest.raises(DBAPIError), conn.begin():
            conn.execute(text("UPDATE ledger_accounts SET parent_id = id WHERE id = 'm19-cash'"))
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            assert conn.scalar(text("SELECT count(*) FROM ledger_accounts WHERE id LIKE 'm19-%'")) == 0
        for statement in ("UPDATE journal_entries SET reference = 'x'", "DELETE FROM journal_entries"):
            with pytest.raises(DBAPIError), app.begin() as conn:
                conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
                conn.execute(text(statement))
    finally:
        app.dispose()
    with ledger.connect() as conn:
        inspector = inspect(conn)
        for model in MODELS:
            name = str(model.__tablename__)
            meta = Base.metadata.tables[name]
            assert {c["name"]: c["nullable"] for c in inspector.get_columns(name)} == {
                c.name: c.nullable for c in meta.columns
            }
            assert {tuple(u["column_names"]) for u in inspector.get_unique_constraints(name)} == {
                tuple(c.name for c in u.columns) for u in meta.constraints if isinstance(u, UniqueConstraint)
            }
            flags = conn.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'INSERT'), "
                    "has_table_privilege('nexus_app', oid, 'UPDATE') FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            assert tuple(flags) == (True, True, name == "journal_entries", False)
            assert conn.scalar(text("SELECT policyname FROM pg_policies WHERE tablename = :n"), {"n": name}) == (
                "tenant_isolation"
            )
