"""M12 admissions on the real backend: routes, mock parity, guard order, audit, encryption and forced RLS."""

import asyncio
import json
from collections.abc import Iterator
from typing import Any, cast

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Connection, Engine, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from nexus.core.fieldcrypto import FieldCipher
from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.core.vault import Vault, key_name
from nexus.modules.m12.models import AdmissionOffer, Application, Enquiry, WaitlistEntry
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13 import test_learner_records as m13
from tests.fake_keycloak import FakeKeycloak

# Same key-service stub as the M13 tests: storage and reads still use the production FieldCipher.
m13_vault = m13.m13_vault
API = "/api/v1/"
TENANT, INSTITUTION, STAFF = "ten-ls", "ins-ls", "rp-ls-priya-staff"  # Priya: staff profile, admissions manager
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}  # no m12.admissions.manage
INPUT: dict[str, Any] = {
    "campusId": None,
    "contactName": "Test contact",
    "contactPhone": None,
    "contactEmail": "contact@example.test",
    "learnerName": "Test learner",
    "programId": None,
    "source": "phone",
    "followUpOn": None,
}
MODELS = (Enquiry, Application, AdmissionOffer, WaitlistEntry)


def csrf(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


def add_program(conn: Connection, tenant: str, institution: str, program: str) -> None:
    conn.execute(
        text(
            "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) "
            "VALUES (:id, :tenant, :ins, :id, 'Test program', 'course', true)"
        ),
        {"id": program, "tenant": tenant, "ins": institution},
    )


@pytest.fixture
def admissions(test_db: DbUrls) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO institutions SELECT (jsonb_populate_record(NULL::institutions, to_jsonb(i) || "
                "jsonb_build_object('id', 'm12-ins-b', 'name', 'Test institution B'))).* "
                "FROM institutions i WHERE i.id = :ins"
            ),
            {"ins": INSTITUTION},
        )
        add_program(conn, TENANT, "m12-ins-b", "m12-program-b")
        add_program(conn, TENANT, INSTITUTION, "m12-apply")
        add_program(conn, "ten-rv", "ins-rv", "m12-foreign")
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            for table in ("waitlist_entries", "admission_offers", "applications", "enquiries"):
                conn.execute(text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": TENANT})  # noqa: S608
            conn.execute(text("DELETE FROM custom_field_definitions WHERE id = 'm12-note'"))
            conn.execute(text("DELETE FROM form_definitions WHERE id = 'm12-form'"))
            conn.execute(text("DELETE FROM programs WHERE id IN ('m12-program-b', 'm12-apply', 'm12-foreign')"))
            conn.execute(text("DELETE FROM institutions WHERE id = 'm12-ins-b'"))
        engine.dispose()


def test_create_read_back_paging_and_audit(client: TestClient, kc: FakeKeycloak, admissions: Engine) -> None:
    sign_in(client, kc)
    body = {**INPUT, "programId": "m12-program-b"}
    first = client.post(API + "enquiries", json=body, headers=csrf(client))
    assert first.status_code == 201, first.text
    row = first.json()
    # Staff at institution A choosing a program at institution B: the enquiry belongs to B; assignee is the staff row.
    assert row == {
        **body,
        "id": row["id"],
        "tenantId": TENANT,
        "institutionId": "m12-ins-b",
        "assignedStaffProfileId": STAFF,
        "status": "new",
        "campaignCode": None,
        "lostReason": None,
        "createdAt": row["createdAt"],
        "updatedAt": row["createdAt"],
    }
    assert row["id"].startswith("enq-") and row["createdAt"].endswith("Z")
    second = client.post(API + "enquiries", json=INPUT, headers=csrf(client))
    assert second.status_code == 201 and second.json()["institutionId"] == INSTITUTION
    page = client.get(API + "enquiries", params={"status": "new", "page": 1, "pageSize": 1}).json()
    assert page == {"items": [row], "total": 2, "page": 1, "pageSize": 1}
    assert client.get(API + "enquiries", params={"page": 2, "pageSize": 1}).json()["items"] == [second.json()]
    assert client.get(API + "enquiries", params={"status": "lost"}).json()["total"] == 0
    with admissions.connect() as conn:
        changes = conn.execute(
            text("SELECT changes FROM audit_events WHERE target_id = :id AND action = 'm12.enquiry.created'"),
            {"id": row["id"]},
        ).scalar_one()
    assert {change["field"] for change in changes} == set(INPUT)
    assert all(set(change) == {"field", "sensitive"} for change in changes)
    assert "contact@example.test" not in json.dumps(changes)


def test_invalid_body_and_foreign_references(client: TestClient, kc: FakeKeycloak, admissions: Engine) -> None:
    sign_in(client, kc)
    cases: list[tuple[dict[str, Any], str]] = [
        ({"contactEmail": None}, "contactPhone"),
        ({"campusId": "cmp-rv-north"}, "campusId"),
        ({"programId": "m12-foreign"}, "programId"),
        ({"private-test-key": "private-test-value"}, ""),
    ]
    for overrides, path in cases:
        response = client.post(API + "enquiries", json={**INPUT, **overrides}, headers=csrf(client))
        assert response.status_code == 400, response.text
        error = response.json()["error"]
        assert error["code"] == "invalid_request" and error["details"][0]["path"] == path
        assert "private-test" not in response.text
    headers = {**csrf(client), "Content-Type": "application/json"}
    bad_json = client.post(API + "enquiries", content="{", headers=headers)
    assert bad_json.status_code == 400
    assert bad_json.json()["error"]["details"] == [{"path": "", "message": "Invalid JSON body"}]


def test_guard_precedes_body(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc, **TEACHER)
    denied = client.post(API + "enquiries", content="{", headers=csrf(client))
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "forbidden"
    engine = create_engine(test_db.owner_url)
    switch = text(
        "UPDATE entitlements SET source = :source, enabled = :enabled WHERE tenant_id = :t AND module_id = 'M12'"
    )
    with engine.begin() as conn:
        conn.execute(switch, {"t": TENANT, "source": "plan", "enabled": False})
    try:
        for res in (client.get(API + "enquiries"), client.post(API + "enquiries", content="{", headers=csrf(client))):
            assert res.status_code == 403 and res.json()["error"]["code"] == "module_disabled"
    finally:
        with engine.begin() as conn:
            conn.execute(switch, {"t": TENANT, "source": "core", "enabled": True})
        engine.dispose()


def test_answers_encrypted_offers_waitlist_and_isolation(
    client: TestClient, kc: FakeKeycloak, admissions: Engine, m13_vault: Vault
) -> None:
    cipher = cast(FastAPI, client.app).state.field_cipher
    assert isinstance(cipher, FieldCipher)
    field = "applications.sensitive_answers"
    envelope = asyncio.run(cipher.encrypt(key_name(TENANT, "tenant_data"), field, '{"privateNote":"test answer"}'))
    assert envelope.startswith("v1:") and "test answer" not in envelope
    t = {"t": TENANT}
    with admissions.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO form_definitions (id, tenant_id, entity, name, field_keys, public, published) VALUES "
                """('m12-form', :t, 'application', 'Test form', '["privateNote","interest"]', false, true)"""
            ),
            t,
        )
        conn.execute(
            text(
                "INSERT INTO custom_field_definitions (id, tenant_id, entity, key, label, type, required, sensitive, "
                """"order", archived) VALUES ('m12-note', :t, 'application', 'privateNote', '{"en":"Note"}', 'text', """
                "false, true, 0, false)"
            ),
            t,
        )
        conn.execute(
            text(
                "INSERT INTO applications (id, tenant_id, institution_id, application_number, form_id, "
                "academic_year_id, program_id, applicant_person_id, guardian_person_ids, document_ids, status, "
                "answers, sensitive_answers) VALUES ('m12-app', :t, :ins, 'A1', 'm12-form', 'cal-ls-2026', "
                """'m12-apply', 'per-ls-priya', '{}', '{}', 'draft', '{"interest":"music"}', :secret)"""
            ),
            {**t, "ins": INSTITUTION, "secret": envelope},
        )
        conn.execute(
            text(
                "INSERT INTO admission_offers (id, tenant_id, application_id, expires_on, status) "
                "VALUES ('m12-offer', :t, 'm12-app', current_date, 'open')"
            ),
            t,
        )
        conn.execute(
            text(
                "INSERT INTO waitlist_entries (id, tenant_id, application_id, program_id, position) "
                "VALUES ('m12-wait', :t, 'm12-app', 'm12-apply', 1)"
            ),
            t,
        )
    for bad in ("""answers = '{"privateNote":"plaintext"}'""", "sensitive_answers = 'plaintext'"):
        with pytest.raises(IntegrityError), admissions.begin() as conn:
            conn.execute(text(f"UPDATE applications SET {bad} WHERE id = 'm12-app'"))  # noqa: S608
    with admissions.connect() as conn:
        stored = conn.execute(text("SELECT answers, sensitive_answers FROM applications WHERE id = 'm12-app'")).one()
    assert tuple(stored) == ({"interest": "music"}, envelope)
    sign_in(client, kc)
    application = client.get(API + "applications").json()["items"][0]
    assert application["answers"] == {"interest": "music", "privateNote": "test answer"}
    assert "sensitiveAnswers" not in application
    assert client.get(API + "admission-offers").json()["items"][0]["id"] == "m12-offer"
    assert client.get(API + "waitlist").json()["items"][0]["position"] == 1
    with admissions.begin() as conn:  # Another tenant sees none of these rows through nexus_app.
        conn.execute(text("SET LOCAL ROLE nexus_app"))
        conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
        for model in MODELS:
            assert conn.execute(text(f"SELECT count(*) FROM {model.__tablename__}")).scalar_one() == 0  # noqa: S608


def test_models_forced_rls_and_grants(test_db: DbUrls) -> None:
    engine = create_engine(test_db.owner_url)
    with engine.connect() as conn:
        inspector = inspect(conn)
        for model in MODELS:
            name = str(model.__tablename__)
            table = Base.metadata.tables[name]
            actual = inspector.get_columns(name)
            columns = {c["name"]: (c["type"].compile(dialect=conn.dialect), c["nullable"]) for c in actual}
            assert columns == {c.name: (str(c.type.compile(dialect=conn.dialect)), c.nullable) for c in table.columns}
            assert {
                (tuple(fk["constrained_columns"]), tuple(f"{fk['referred_table']}.{c}" for c in fk["referred_columns"]))
                for fk in inspector.get_foreign_keys(name)
            } == {
                (tuple(fk.column_keys), tuple(ref.target_fullname for ref in fk.elements))
                for fk in table.foreign_key_constraints
            }
            assert {tuple(u["column_names"]) for u in inspector.get_unique_constraints(name)} == {
                tuple(c.name for c in u.columns) for u in table.constraints if isinstance(u, UniqueConstraint)
            }
            flags = conn.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'INSERT'), "
                    "has_table_privilege('nexus_app', oid, 'UPDATE') FROM pg_class WHERE oid = to_regclass(:name)"
                ),
                {"name": name},
            ).one()
            assert tuple(flags) == (True, True, name == "enquiries", False)
            policy = conn.scalar(text("SELECT policyname FROM pg_policies WHERE tablename = :name"), {"name": name})
            assert policy == "tenant_isolation"
    engine.dispose()
