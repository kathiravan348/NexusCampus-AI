"""M22 report cards and M23 issued documents on the real backend (NEX-190): lists, filters, family scope and masking,
status transitions, revocation, encrypted remarks and reasons with sensitive-read audit, forced RLS and grants."""

import asyncio
import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from nexus.agent.tenant_export import ENCRYPTED_COLUMNS
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.core.vault import Vault, key_name
from nexus.modules.m22.models import IssuedDocument, ReportCard
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13 import test_learner_records as m13
from tests.fake_keycloak import FakeKeycloak

m13_vault = m13.m13_vault
guardian = m13.guardian
API = "/api/v1/"
YEAR = "cal-ls-2026"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
LEARNERS = {"m22-a": "rp-ls-rohan-learner", "m22-b": "rp-ls-anaya-learner"}
LINES = [{"subjectId": "sub-x", "grade": "A", "marksPercent": 91.5}]
REMARK, OVERALL, REASON = "Test line remark", "Test overall remark", "Test revocation reason"


def csrf(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


def seal(vault: Vault, field: str, value: str) -> str:
    return asyncio.run(FieldCipher(vault).encrypt(key_name("ten-ls", "tenant_data"), field, value))


@pytest.fixture
def records(test_db: DbUrls, m13_vault: Vault) -> Iterator[Engine]:
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
                "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) "
                "VALUES ('m22-pr', 'ten-ls', 'ins-ls', 'M22', 'Program', 'course', true)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, kind, code, "
                "name) VALUES ('m22-cg', 'ten-ls', 'ins-ls', :y, 'm22-pr', 'group', 'M22', 'Group')"
            ),
            {"y": YEAR},
        )
        conn.execute(
            text(
                "INSERT INTO enrolments (id, tenant_id, learner_id, academic_year_id, program_id, class_group_id, "
                "status, effective_from) VALUES ('m22-en', 'ten-ls', 'm22-a', :y, 'm22-pr', 'm22-cg', 'active', "
                "'2026-01-01')"
            ),
            {"y": YEAR},
        )
        remarks = seal(m13_vault, "report_cards.line_remarks", json.dumps([REMARK]))
        overall = seal(m13_vault, "report_cards.overall_remark", OVERALL)
        for card, learner, status, sealed in (
            ("m22-rc1", "m22-a", "draft", True),
            ("m22-rc2", "m22-a", "published", False),
            ("m22-rc3", "m22-b", "approved", False),
        ):
            conn.execute(
                text(
                    "INSERT INTO report_cards (id, tenant_id, learner_id, academic_year_id, template_id, lines, "
                    "line_remarks, overall_remark, status, published_at) VALUES (:id, 'ten-ls', :l, :y, 'tpl-1', "
                    "CAST(:lines AS jsonb), :lr, :o, :s, CASE WHEN :pub THEN now() END)"
                ),
                {
                    "id": card,
                    "l": learner,
                    "y": YEAR,
                    "s": status,
                    "pub": status == "published",
                    "lines": json.dumps(LINES),
                    "lr": remarks if sealed else None,
                    "o": overall if sealed else None,
                },
            )
        reason = seal(m13_vault, "issued_documents.revoked_reason", REASON)
        documents: list[tuple[str, str | None, str, bool]] = [
            ("m22-d1", "m22-a", "M22CODE00001", True),
            ("m22-d2", "m22-b", "M22CODE00002", False),
            ("m22-d3", None, "M22CODE00003", False),
        ]
        for document, owner, code, revoked in documents:
            conn.execute(
                text(
                    "INSERT INTO issued_documents (id, tenant_id, learner_id, kind, number, template_id, issued_on, "
                    "signatures, verification_code, revoked, revoked_reason) VALUES (:id, 'ten-ls', :l, 'bonafide', "
                    ":id, 'tpl-1', '2026-06-01', '[]', :c, :r, :reason)"
                ),
                {"id": document, "l": owner, "c": code, "r": revoked, "reason": reason if revoked else None},
            )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            for table, ids in (
                ("issued_documents", ["m22-d1", "m22-d2", "m22-d3"]),
                ("report_cards", ["m22-rc1", "m22-rc2", "m22-rc3"]),
                ("enrolments", ["m22-en"]),
                ("class_groups", ["m22-cg"]),
                ("programs", ["m22-pr"]),
                ("learners", list(LEARNERS)),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
        engine.dispose()


def mine(res: Any) -> list[dict[str, Any]]:
    assert res.status_code == 200, res.text
    return [row for row in res.json()["items"] if row["id"].startswith("m22-")]


def count(engine: Engine, action: str) -> int:
    with engine.connect() as conn:
        return int(conn.scalar(text("SELECT count(*) FROM audit_events WHERE action = :a"), {"a": action}) or 0)


def test_report_cards_scope_and_remarks(client: TestClient, kc: FakeKeycloak, records: Engine) -> None:
    sign_in(client, kc)
    cards = mine(client.get(API + "report-cards", params={"pageSize": 100}))
    assert [c["id"] for c in cards] == ["m22-rc1", "m22-rc2", "m22-rc3"]
    assert cards[0]["lines"] == [{**LINES[0], "remark": REMARK}] and cards[0]["overallRemark"] == OVERALL
    assert cards[1]["lines"][0]["remark"] is None and cards[1]["publishedAt"] is not None
    assert count(records, "m22.reportCard.sensitiveRead") >= 1
    assert [c["id"] for c in mine(client.get(API + "report-cards", params={"classGroupId": "m22-cg"}))] == [
        "m22-rc1",
        "m22-rc2",
    ]
    assert [c["id"] for c in mine(client.get(API + "report-cards", params={"learnerId": "m22-b"}))] == ["m22-rc3"]
    assert client.get(API + "report-cards", params={"classGroupId": "nope"}).status_code == 404
    guardian(client, kc, records)
    assert [c["id"] for c in mine(client.get(API + "report-cards"))] == ["m22-rc2"]
    assert client.get(API + "report-cards", params={"learnerId": "m22-b"}).status_code == 404


def test_status_transitions(client: TestClient, kc: FakeKeycloak, records: Engine) -> None:
    sign_in(client, kc)
    url = API + "report-cards/m22-rc1/status"
    steps = [("approved", None), ("published", "set"), ("withdrawn", None)]
    for status, published in steps:
        res = client.post(url, json={"status": status}, headers=csrf(client))
        assert res.status_code == 200, res.text
        card = res.json()
        assert card["status"] == status and (card["publishedAt"] is not None) == (published == "set")
        assert card["overallRemark"] == OVERALL
    again = client.post(url, json={"status": "withdrawn"}, headers=csrf(client))
    assert again.status_code == 409 and again.json()["error"]["details"] == [
        {"path": "status", "message": "Invalid transition"}
    ]
    for body in ({"status": "draft"}, {"status": "approved", "extra": 1}, {}):
        res = client.post(url, json=body, headers=csrf(client))
        assert res.status_code == 400 and res.json()["error"]["details"] == [
            {"path": "status", "message": "Invalid status"}
        ]
    assert (
        client.post(API + "report-cards/nope/status", json={"status": "approved"}, headers=csrf(client)).status_code
        == 404
    )
    assert count(records, "m22.reportCard.statusChanged") >= 3
    sign_in(client, kc, **TEACHER)  # no m22.reports.publish
    assert client.post(url, content="{", headers=csrf(client)).status_code == 403


def test_documents_and_revocation(client: TestClient, kc: FakeKeycloak, records: Engine) -> None:
    sign_in(client, kc)
    documents = mine(client.get(API + "issued-documents", params={"pageSize": 100}))
    assert [(d["id"], d["revokedReason"]) for d in documents] == [
        ("m22-d1", REASON),
        ("m22-d2", None),
        ("m22-d3", None),
    ]
    assert count(records, "m23.issuedDocument.sensitiveRead") >= 1
    res = client.post(API + "issued-documents/m22-d2/revoke", json={"reason": " New reason "}, headers=csrf(client))
    assert res.status_code == 200 and (res.json()["revoked"], res.json()["revokedReason"]) == (True, "New reason")
    with records.connect() as conn:
        stored = conn.scalar(text("SELECT revoked_reason FROM issued_documents WHERE id = 'm22-d2'"))
        changes = conn.scalar(
            text(
                "SELECT changes FROM audit_events WHERE action = 'm23.issuedDocument.revoked' AND target_id = 'm22-d2'"
            )
        )
    assert stored.startswith("v1:") and "New reason" not in stored
    assert changes == [{"field": "reason", "sensitive": True}]
    again = client.post(API + "issued-documents/m22-d2/revoke", json={"reason": "x"}, headers=csrf(client))
    assert again.status_code == 409 and again.json()["error"]["details"] == [{"path": "revoked", "message": "conflict"}]
    for body in ({"reason": "  "}, {"reason": "x" * 301}, {}):
        bad = client.post(API + "issued-documents/m22-d3/revoke", json=body, headers=csrf(client))
        assert bad.status_code == 400 and bad.json()["error"]["details"] == [
            {"path": "reason", "message": "invalid_request"}
        ]
    assert (
        client.post(API + "issued-documents/nope/revoke", json={"reason": "x"}, headers=csrf(client)).status_code == 404
    )
    guardian(client, kc, records)
    assert [(d["id"], d["revokedReason"]) for d in mine(client.get(API + "issued-documents"))] == [("m22-d1", None)]
    assert client.post(API + "issued-documents/m22-d3/revoke", content="{", headers=csrf(client)).status_code == 403


def test_storage_rls_grants_and_models(test_db: DbUrls, records: Engine) -> None:
    for key in (
        ("report_cards", "line_remarks"),
        ("report_cards", "overall_remark"),
        ("issued_documents", "revoked_reason"),
    ):
        assert ENCRYPTED_COLUMNS[key].field == ".".join(key)
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            assert conn.scalar(text("SELECT count(*) FROM report_cards WHERE id LIKE 'm22-%'")) == 0
        for statement in ("UPDATE report_cards SET lines = '[]'", "UPDATE issued_documents SET number = 'x'"):
            with pytest.raises(DBAPIError), app.begin() as conn:
                conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
                conn.execute(text(statement))
    finally:
        app.dispose()
    with records.connect() as conn:
        for bad in (
            "UPDATE report_cards SET overall_remark = 'plain' WHERE id = 'm22-rc1'",
            "UPDATE report_cards SET status = 'published' WHERE id = 'm22-rc1'",
            "UPDATE issued_documents SET revoked = false WHERE id = 'm22-d1'",
            "UPDATE issued_documents SET verification_code = 'short' WHERE id = 'm22-d2'",
        ):
            with pytest.raises(DBAPIError), conn.begin():
                conn.execute(text(bad))
        inspector = inspect(conn)
        for model in (ReportCard, IssuedDocument):
            name = str(model.__tablename__)
            meta = Base.metadata.tables[name]
            assert {c["name"]: c["nullable"] for c in inspector.get_columns(name)} == {
                c.name: c.nullable for c in meta.columns
            }
            flags = conn.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'INSERT'), "
                    "has_table_privilege('nexus_app', oid, 'DELETE') FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            assert tuple(flags) == (True, True, False, False)
