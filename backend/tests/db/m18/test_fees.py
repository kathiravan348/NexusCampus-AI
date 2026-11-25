"""M18 fees on the real backend (NEX-188): staff lists, family scope, payment application and receipts, replay,
encrypted reasons with sensitive-read audit, forced RLS and the narrow invoice UPDATE grant."""

import asyncio
import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from nexus.agent.tenant_export import ENCRYPTED_COLUMNS
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.core.vault import Vault, key_name
from nexus.modules.m18.models import Concession, FeeHead, FeeInvoice, FeePayment, FeePlan, FeeRefund
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13 import test_learner_records as m13
from tests.fake_keycloak import FakeKeycloak

m13_vault = m13.m13_vault
guardian = m13.guardian
API = "/api/v1/"
YEAR, PRIYA = "cal-ls-2026", "rp-ls-priya-staff"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
MODELS = (FeeHead, FeePlan, Concession, FeeInvoice, FeePayment, FeeRefund)
LEARNERS = {"m18-a": "rp-ls-rohan-learner", "m18-b": "rp-ls-anaya-learner"}
REASON = "Test reason value"
# id, learner, status, total, paid, due
INVOICES = [
    ("m18-inv1", "m18-a", "issued", 1000, 0, "2026-07-01"),
    ("m18-inv2", "m18-a", "part_paid", 2000, 500, "2026-06-01"),
    ("m18-inv3", "m18-b", "issued", 700, 0, "2026-06-01"),
    ("m18-inv4", "m18-a", "draft", 300, 0, "2026-06-01"),
]
PAY: dict[str, Any] = {
    "invoiceIds": ["m18-inv1", "m18-inv2"],
    "currency": "INR",
    "amount": 2000,
    "method": "cash",
    "receivedAt": "2026-06-10T09:30:00Z",
    "deviceId": None,
}


def csrf(client: TestClient, key: str | None = None) -> dict[str, str]:
    headers = {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}
    return {**headers, "Idempotency-Key": key} if key else headers


def seal(vault: Vault, field: str) -> str:
    return asyncio.run(FieldCipher(vault).encrypt(key_name("ten-ls", "tenant_data"), field, REASON))


@pytest.fixture
def fees(test_db: DbUrls, m13_vault: Vault) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        for learner, profile in LEARNERS.items():
            conn.execute(
                text(
                    "INSERT INTO learners (id, tenant_id, institution_id, campus_id, person_id, role_profile_id, "
                    "learner_number, status, admission_date, retention_state, custom_fields) SELECT :id, tenant_id, "
                    "institution_id, campus_id, person_id, id, :id, 'enrolled', '2026-01-01', 'active', '{}' "
                    "FROM role_profiles WHERE id = :p"
                ),
                {"id": learner, "p": profile},
            )
        conn.execute(
            text(
                "INSERT INTO fee_heads (id, tenant_id, institution_id, code, name, tax_rate_basis_points, refundable, "
                "active) VALUES ('m18-head', 'ten-ls', 'ins-ls', 'TUI', 'Tuition', 0, true, true)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO fee_plans (id, tenant_id, institution_id, academic_year_id, name, currency, lines, "
                "instalments) VALUES ('m18-plan', 'ten-ls', 'ins-ls', :y, 'Plan', 'INR', CAST(:l AS jsonb), "
                "CAST(:i AS jsonb))"
            ),
            {
                "y": YEAR,
                "l": json.dumps([{"feeHeadId": "m18-head", "amount": 1000}]),
                "i": json.dumps([{"code": "T1", "dueOn": "2026-06-01", "sharePercentBasisPoints": 10000}]),
            },
        )
        conn.execute(
            text(
                "INSERT INTO concessions (id, tenant_id, learner_id, fee_plan_id, kind, mode, value, reason, "
                "valid_from) VALUES ('m18-con', 'ten-ls', 'm18-a', 'm18-plan', 'sibling', 'percent', 1000, :r, "
                "'2026-01-01')"
            ),
            {"r": seal(m13_vault, "concessions.reason")},
        )
        for invoice, learner, status, total, paid, due in INVOICES:
            conn.execute(
                text(
                    "INSERT INTO fee_invoices (id, tenant_id, learner_id, invoice_number, currency, issued_on, due_on, "
                    "lines, total, paid, status) VALUES (:id, 'ten-ls', :l, :id, 'INR', '2026-05-01', :due, "
                    "CAST(:lines AS jsonb), :total, :paid, :s)"
                ),
                {
                    "id": invoice,
                    "l": learner,
                    "due": due,
                    "total": total,
                    "paid": paid,
                    "s": status,
                    "lines": json.dumps(
                        [{"feeHeadId": "m18-head", "description": "Tuition", "amount": total, "discount": 0, "tax": 0}]
                    ),
                },
            )
        conn.execute(
            text(
                "INSERT INTO fee_payments (id, tenant_id, invoice_ids, payer_person_id, currency, amount, method, "
                "receipt_number, received_at, status) VALUES ('m18-pay-old', 'ten-ls', ARRAY['m18-inv3'], "
                "'per-ls-anaya', 'INR', 100, 'cash', 'R-000007', now(), 'succeeded')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO fee_refunds (id, tenant_id, payment_id, amount, reason, status) "
                "VALUES ('m18-ref', 'ten-ls', 'm18-pay-old', 50, :r, 'requested')"
            ),
            {"r": seal(m13_vault, "fee_refunds.reason")},
        )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM fee_refunds WHERE id = 'm18-ref'"))
            conn.execute(
                text("DELETE FROM fee_payments WHERE invoice_ids && ARRAY['m18-inv1','m18-inv2','m18-inv3']::varchar[]")
            )
            for table, ids in (
                ("fee_invoices", [row[0] for row in INVOICES]),
                ("concessions", ["m18-con"]),
                ("fee_plans", ["m18-plan"]),
                ("fee_heads", ["m18-head"]),
                ("learners", list(LEARNERS)),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
        engine.dispose()


def ids(res: Any) -> list[str]:
    assert res.status_code == 200, res.text
    return [row["id"] for row in res.json()["items"] if row["id"].startswith("m18-")]


def reads(engine: Engine, action: str) -> int:
    with engine.connect() as conn:
        return int(conn.scalar(text("SELECT count(*) FROM audit_events WHERE action = :a"), {"a": action}) or 0)


def test_staff_lists_and_filters(client: TestClient, kc: FakeKeycloak, fees: Engine) -> None:
    sign_in(client, kc)
    assert ids(client.get(API + "fee-heads")) == ["m18-head"]
    assert ids(client.get(API + "fee-plans")) == ["m18-plan"]
    before = reads(fees, "m18.concession.sensitiveRead")
    concession = next(c for c in client.get(API + "concessions").json()["items"] if c["id"] == "m18-con")
    assert concession["reason"] == REASON and reads(fees, "m18.concession.sensitiveRead") == before + 1
    refund = next(r for r in client.get(API + "fee-refunds").json()["items"] if r["id"] == "m18-ref")
    assert refund["reason"] == REASON and reads(fees, "m18.feeRefund.sensitiveRead") >= 1
    assert ids(client.get(API + "fee-invoices", params={"learnerId": "m18-a"})) == ["m18-inv1", "m18-inv2", "m18-inv4"]
    assert ids(client.get(API + "fee-invoices", params={"status": "issued", "pageSize": 100})) == [
        "m18-inv1",
        "m18-inv3",
    ]
    assert client.get(API + "fee-invoices", params={"learnerId": "m18-nope"}).status_code == 404
    assert ids(client.get(API + "fee-payments", params={"invoiceId": "m18-inv3"})) == ["m18-pay-old"]
    assert client.get(API + "fee-payments", params={"invoiceId": "m18-nope"}).status_code == 404


def test_family_scope_and_staff_without_read(client: TestClient, kc: FakeKeycloak, fees: Engine) -> None:
    sign_in(client, kc, **TEACHER)  # staff without m18.fees.read
    for path in ("fee-invoices", "fee-payments", "fee-heads"):
        assert client.get(API + path).status_code == 403, path
    guardian(client, kc, fees)
    assert ids(client.get(API + "fee-invoices")) == ["m18-inv1", "m18-inv2", "m18-inv4"]
    assert client.get(API + "fee-invoices", params={"learnerId": "m18-b"}).status_code == 404
    assert ids(client.get(API + "fee-payments")) == []  # m18-pay-old covers another family's invoice
    assert client.get(API + "fee-payments", params={"invoiceId": "m18-inv3"}).status_code == 404
    assert client.get(API + "concessions").status_code == 403


def test_payment_applies_oldest_first_and_replays(client: TestClient, kc: FakeKeycloak, fees: Engine) -> None:
    sign_in(client, kc)
    first = client.post(API + "fee-payments", json=PAY, headers=csrf(client, "m18-key-1"))
    assert first.status_code == 201, first.text
    payment = first.json()
    assert {k: payment[k] for k in ("receiptNumber", "payerPersonId", "status", "gatewayReference", "receivedAt")} == {
        "receiptNumber": "R-000008",
        "payerPersonId": "per-ls-rohan",
        "status": "succeeded",
        "gatewayReference": None,
        "receivedAt": "2026-06-10T09:30:00Z",
    }
    assert client.post(API + "fee-payments", json=PAY, headers=csrf(client, "m18-key-1")).json() == payment
    invoices = {i["id"]: i for i in client.get(API + "fee-invoices", params={"learnerId": "m18-a"}).json()["items"]}
    assert (invoices["m18-inv2"]["paid"], invoices["m18-inv2"]["status"]) == (2000, "paid")  # due first
    assert (invoices["m18-inv1"]["paid"], invoices["m18-inv1"]["status"]) == (500, "part_paid")
    with fees.connect() as conn:
        events = conn.execute(
            text("SELECT changes FROM audit_events WHERE action = 'm18.feePayment.created' AND target_id = :id"),
            {"id": payment["id"]},
        ).all()
    assert len(events) == 1 and {c["field"] for c in events[0].changes} == set(PAY)
    second = client.post(
        API + "fee-payments", json={**PAY, "invoiceIds": ["m18-inv1"], "amount": 100}, headers=csrf(client)
    )
    assert second.status_code == 201 and second.json()["receiptNumber"] == "R-000009"


def test_payment_errors_and_guard_order(client: TestClient, kc: FakeKeycloak, fees: Engine) -> None:
    sign_in(client, kc)
    cases: list[tuple[dict[str, Any], str, str]] = [
        ({"invoiceIds": ["m18-inv4"]}, "invoiceIds", "Invoice is not open for payment"),
        ({"invoiceIds": ["m18-nope"]}, "invoiceIds", "Invoice is not open for payment"),
        ({"currency": "USD"}, "currency", "Currency does not match the selected invoices"),
        ({"amount": 99999}, "amount", "Amount exceeds remaining balance"),
    ]
    for change, path, message in cases:
        res = client.post(API + "fee-payments", json={**PAY, **change}, headers=csrf(client))
        assert res.status_code == 400 and res.json()["error"]["details"] == [{"path": path, "message": message}]
    bodies: list[tuple[dict[str, Any], str]] = [
        ({"amount": 0}, "amount"),
        ({"amount": 1.5}, "amount"),
        ({"method": "card"}, "method"),
        ({"currency": "XXY"}, "currency"),
        ({"receivedAt": "2026-06-10T09:30:00+05:30"}, "receivedAt"),
        ({"invoiceIds": ["m18-inv1", "m18-inv1"]}, "invoiceIds"),
        ({"extra": 1}, ""),
    ]
    for change, path in bodies:
        res = client.post(API + "fee-payments", json={**PAY, **change}, headers=csrf(client))
        assert res.status_code == 400 and path in [d["path"] for d in res.json()["error"]["details"]], change
        assert all(d["message"] == "Invalid fee payment" for d in res.json()["error"]["details"])
    sign_in(client, kc, **TEACHER)
    assert client.post(API + "fee-payments", content="{", headers=csrf(client)).status_code == 403
    with fees.connect() as conn:
        assert conn.scalar(text("SELECT paid FROM fee_invoices WHERE id = 'm18-inv1'")) == 0


def test_storage_rls_grants_and_models(test_db: DbUrls, fees: Engine) -> None:
    for table in ("concessions", "fee_refunds"):
        assert ENCRYPTED_COLUMNS[(table, "reason")].field == f"{table}.reason"
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            for name in ("fee_invoices", "fee_payments", "concessions"):
                assert conn.scalar(text(f"SELECT count(*) FROM {name} WHERE id LIKE 'm18-%'")) == 0  # noqa: S608
        for statement in (
            "UPDATE fee_invoices SET total = 1",
            "UPDATE fee_payments SET amount = 1",
            "DELETE FROM fee_invoices",
        ):
            with pytest.raises(DBAPIError), app.begin() as conn:
                conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
                conn.execute(text(statement))
    finally:
        app.dispose()
    with fees.connect() as conn:
        for bad in (
            "UPDATE concessions SET reason = 'plain' WHERE id = 'm18-con'",
            "UPDATE fee_invoices SET paid = 5000 WHERE id = 'm18-inv1'",
            "UPDATE fee_invoices SET status = 'paid' WHERE id = 'm18-inv1'",
            "UPDATE fee_payments SET invoice_ids = ARRAY['a','a'] WHERE id = 'm18-pay-old'",
        ):
            with pytest.raises(DBAPIError), conn.begin():
                conn.execute(text(bad))
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
                    "has_table_privilege('nexus_app', oid, 'DELETE') FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            assert tuple(flags) == (True, True, name == "fee_payments", False)
        updatable = conn.scalars(
            text(
                "SELECT column_name FROM information_schema.column_privileges WHERE grantee = 'nexus_app' "
                "AND privilege_type = 'UPDATE' AND table_name LIKE 'fee%' OR (grantee = 'nexus_app' "
                "AND privilege_type = 'UPDATE' AND table_name = 'concessions')"
            )
        ).all()
        assert sorted(updatable) == ["paid", "status", "updated_at"]
