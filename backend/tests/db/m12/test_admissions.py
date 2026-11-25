"""Exercise the registered M12 routes with PostgreSQL RLS and signed-in demo staff."""

import asyncio
import base64
import hashlib
import json
import os
import secrets
import sys
from collections.abc import Iterator
from dataclasses import dataclass
from importlib.metadata import entry_points
from pathlib import Path
from unittest.mock import patch

import httpx2
import psycopg
import pytest
from alembic import command
from alembic.config import Config
from dotenv import dotenv_values
from fastapi import FastAPI
from fastapi.testclient import TestClient
from psycopg import sql
from sqlalchemy.engine import make_url

from nexus.agent.backup import libpq_url
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.vault import HttpVault, key_name
from nexus.main import create_app
from nexus.modules.m12.models import AdmissionOffer, Application, Enquiry, WaitlistEntry
from nexus.modules.m83.keys import cipher_of
from nexus.settings import Settings, get_settings

BACKEND = Path(__file__).resolve().parents[3]
BASE = "/api/v1"
INPUT = {
    "campusId": None,
    "contactName": "Test contact",
    "contactPhone": None,
    "contactEmail": "contact@example.test",
    "learnerName": "Test learner",
    "programId": None,
    "source": "phone",
    "followUpOn": None,
}


@dataclass
class AdmissionsCase:
    app: FastAPI
    db: psycopg.Connection
    client: TestClient
    tenant: str
    user: str
    staff: str
    institution: str


def sign_in(db: psycopg.Connection, client: TestClient, tenant: str, user: str) -> None:
    session_id = f"ses-{secrets.token_hex(12)}"
    token = f"{tenant}.{session_id}.{secrets.token_urlsafe(32)}"
    csrf = secrets.token_urlsafe(32)
    db.execute(
        "INSERT INTO sessions SELECT (jsonb_populate_record(NULL::sessions, to_jsonb(s) || "
        "jsonb_build_object('id',%s::text,'user_id',%s::text,'token_hash',%s::text,'mfa_verified',true,"
        "'created_at',now(),'last_seen_at',now(),'revoked_at',NULL,'expires_at',now()+interval '1 hour'))).* "
        "FROM sessions s WHERE s.tenant_id=%s LIMIT 1",
        (session_id, user, hashlib.sha256(token.encode()).hexdigest(), tenant),
    )
    client.cookies.clear()
    client.cookies.set("nexus_session", token)
    client.cookies.set("nexus_csrf", csrf)
    client.headers["X-CSRF-Token"] = csrf


@pytest.fixture(scope="module")
def case() -> Iterator[AdmissionsCase]:
    config = {**dotenv_values(BACKEND / ".env"), **os.environ}
    owner = make_url(str(config["NEXUS_MIGRATE_DATABASE_URL"]))
    app_url = make_url(str(config["NEXUS_DATABASE_URL"]))
    name = f"nexus_test_m12_{secrets.token_hex(8)}"
    owner_url = owner.set(database=name).render_as_string(hide_password=False)
    with psycopg.connect(libpq_url(owner.render_as_string(hide_password=False)), autocommit=True) as admin:
        admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
        try:
            with pytest.MonkeyPatch.context() as env:
                env.chdir(BACKEND)
                env.setenv("NEXUS_MIGRATE_DATABASE_URL", owner_url)
                env.setenv("NEXUS_DATABASE_URL", app_url.set(database=name).render_as_string(hide_password=False))
                get_settings.cache_clear()
                env.setattr(sys, "argv", ["nexus-seed"])
                seed = next(iter(entry_points(group="console_scripts", name="nexus-seed")))
                with patch("logging.config.fileConfig"):  # Keep pytest's log capture active during database setup.
                    command.upgrade(Config(str(BACKEND / "alembic.ini")), "head")
                    seed.load()()
                settings = Settings()
                with psycopg.connect(libpq_url(owner_url), autocommit=True) as db:
                    actor_query = (
                        "SELECT u.tenant_id, u.id, r.id, r.institution_id FROM users u "
                        "JOIN tenants t ON t.id=u.tenant_id JOIN role_profiles r ON r.person_id=u.person_id "
                        "JOIN role_assignments a ON a.user_id=u.id JOIN role_permissions p ON p.role_id=a.role_id "
                        "JOIN entitlements e ON e.tenant_id=u.tenant_id AND e.module_id='M12' "
                        "WHERE t.region=%s AND r.kind='staff' AND u.status='active' AND e.enabled "
                        "AND a.effective_from<=current_date "
                        "AND (a.effective_to IS NULL OR a.effective_to>=current_date) "
                        "AND EXISTS (SELECT FROM sessions s WHERE s.tenant_id=u.tenant_id) "
                        "AND p.permission_code='m12.admissions.manage' ORDER BY u.id,r.id LIMIT 1"
                    )
                    actor = db.execute(actor_query, (settings.region,)).fetchone()
                    assert actor is not None
                    app = create_app(settings)
                    options = {"loop_factory": asyncio.SelectorEventLoop}
                    with TestClient(app, base_url="https://testserver", backend_options=options) as client:
                        sign_in(db, client, actor[0], actor[1])
                        yield AdmissionsCase(app, db, client, *actor)
        finally:
            get_settings.cache_clear()
            admin.execute(sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(name)))


def add_program(db: psycopg.Connection, tenant: str, institution: str, program: str) -> None:
    db.execute(
        "INSERT INTO programs (id,tenant_id,institution_id,code,name,kind,active) "
        "VALUES (%s,%s,%s,%s,'Test program','course',true)",
        (program, tenant, institution, program),
    )


def test_create_uses_program_institution_and_staff_assignee(case: AdmissionsCase) -> None:
    db, client = case.db, case.client
    db.execute(
        "INSERT INTO institutions SELECT (jsonb_populate_record(NULL::institutions, "
        "to_jsonb(i) || jsonb_build_object('id','m12-institution-b','name','Test institution B'))).* "
        "FROM institutions i WHERE i.id=%s",
        (case.institution,),
    )
    add_program(db, case.tenant, "m12-institution-b", "m12-program-b")
    body = {**INPUT, "programId": "m12-program-b"}
    first = client.post(f"{BASE}/enquiries", json=body)
    assert first.status_code == 201, first.text
    row = first.json()
    assert row == {
        **body,
        "id": row["id"],
        "tenantId": case.tenant,
        "institutionId": "m12-institution-b",
        "assignedStaffProfileId": case.staff,
        "status": "new",
        "campaignCode": None,
        "lostReason": None,
        "createdAt": row["createdAt"],
        "updatedAt": row["createdAt"],
    }
    assert row["id"].startswith("enq-") and row["createdAt"].endswith("Z")
    second = client.post(f"{BASE}/enquiries", json=INPUT)
    assert second.status_code == 201
    assert second.json()["institutionId"] == case.institution
    page = client.get(f"{BASE}/enquiries?status=new&page=1&pageSize=1").json()
    assert page == {"items": [row], "total": 2, "page": 1, "pageSize": 1}
    assert client.get(f"{BASE}/enquiries?page=2&pageSize=1").json()["items"] == [second.json()]
    assert client.get(f"{BASE}/enquiries?status=lost").json()["total"] == 0
    audit_query = "SELECT changes FROM audit_events WHERE target_id=%s AND action='m12.enquiry.created'"
    event = db.execute(audit_query, (row["id"],)).fetchone()
    assert event is not None
    assert {change["field"] for change in event[0]} == set(INPUT)
    assert all(set(change) == {"field", "sensitive"} for change in event[0])


def test_invalid_body_and_foreign_references(case: AdmissionsCase) -> None:
    db, client = case.db, case.client
    foreign = db.execute("SELECT id,tenant_id,institution_id FROM campuses WHERE tenant_id<>%s LIMIT 1", (case.tenant,))
    foreign_campus = foreign.fetchone()
    assert foreign_campus is not None
    campus, tenant, institution = foreign_campus
    add_program(db, tenant, institution, "m12-foreign")
    for overrides, path in [
        ({"contactEmail": None}, "contactPhone"),
        ({"campusId": campus}, "campusId"),
        ({"programId": "m12-foreign"}, "programId"),
        ({"private-test-key": "private-test-value"}, ""),
    ]:
        response = client.post(f"{BASE}/enquiries", json={**INPUT, **overrides})
        assert response.status_code == 400
        error = response.json()["error"]
        assert error["code"] == "invalid_request" and error["details"][0]["path"] == path
        assert "private-test" not in response.text
    bad_json = client.post(f"{BASE}/enquiries", content="{")
    assert bad_json.status_code == 400
    assert bad_json.json()["error"]["details"] == [{"path": "", "message": "Invalid JSON body"}]


def test_authorization_precedes_body(case: AdmissionsCase) -> None:
    db, client = case.db, case.client
    viewer_query = (
        "SELECT u.id FROM users u WHERE tenant_id=%s AND status='active' AND NOT EXISTS "
        "(SELECT FROM role_assignments a JOIN role_permissions p ON p.role_id=a.role_id "
        "WHERE a.user_id=u.id AND p.permission_code='m12.admissions.manage') LIMIT 1"
    )
    viewer = db.execute(viewer_query, (case.tenant,)).fetchone()
    assert viewer is not None
    sign_in(db, client, case.tenant, viewer[0])
    try:
        forbidden = client.post(f"{BASE}/enquiries", content="{")
        assert forbidden.status_code == 403 and forbidden.json()["error"]["code"] == "forbidden"
        db.execute("UPDATE entitlements SET enabled=false WHERE tenant_id=%s AND module_id='M12'", (case.tenant,))
        disabled = client.post(f"{BASE}/enquiries", content="{")
        assert disabled.status_code == 403 and disabled.json()["error"]["code"] == "module_disabled"
    finally:
        db.execute("UPDATE entitlements SET enabled=true WHERE tenant_id=%s AND module_id='M12'", (case.tenant,))
        sign_in(db, client, case.tenant, case.user)


def test_application_answers_offers_waitlist_and_rls(case: AdmissionsCase) -> None:
    db, client = case.db, case.client
    tenant, institution = case.tenant, case.institution
    add_program(db, tenant, institution, "m12-apply")
    db.execute(
        "INSERT INTO form_definitions (id,tenant_id,entity,name,field_keys,public,published) "
        """VALUES ('m12-form',%s,'application','Test form','["privateNote","interest"]',false,true)""",
        (tenant,),
    )
    db.execute(
        'INSERT INTO custom_field_definitions (id,tenant_id,entity,key,label,type,required,sensitive,"order",archived) '
        """VALUES ('m12-note',%s,'application','privateNote','{"en":"Note"}','text',false,true,0,false)""",
        (tenant,),
    )
    key = key_name(tenant, "tenant_data")
    field = "applications.sensitive_answers"
    clear_key = base64.b64encode(secrets.token_bytes(32)).decode()
    wrapped_key = "vault:v1:" + base64.b64encode(secrets.token_bytes(48)).decode()

    def transit(request: httpx2.Request) -> httpx2.Response:
        nonlocal clear_key
        assert request.url.path.endswith("/" + key)
        if "/datakey/plaintext/" in request.url.path:
            data = {"plaintext": clear_key, "ciphertext": wrapped_key, "key_version": 1}
        elif "/encrypt/" in request.url.path:
            clear_key = json.loads(request.content)["plaintext"]
            data = {"ciphertext": wrapped_key, "key_version": 1}
        else:
            assert "/decrypt/" in request.url.path and json.loads(request.content)["ciphertext"] == wrapped_key
            data = {"plaintext": clear_key}
        return httpx2.Response(200, json={"data": data})

    http = httpx2.AsyncClient(transport=httpx2.MockTransport(transit))
    cipher = FieldCipher(HttpVault(Settings(), http))
    envelope = asyncio.run(cipher.encrypt(key, field, '{"privateNote":"test answer"}'))
    assert envelope.startswith("v1:") and "test answer" not in envelope
    db.execute(
        "INSERT INTO applications (id,tenant_id,institution_id,application_number,form_id,academic_year_id,"
        "program_id,applicant_person_id,guardian_person_ids,document_ids,status,answers,sensitive_answers) "
        "SELECT 'm12-app',u.tenant_id,%s,'A1','m12-form',c.id,'m12-apply',u.person_id,'{}','{}','draft',"
        """'{"interest":"music"}',%s FROM users u JOIN academic_calendars c ON c.tenant_id=u.tenant_id """
        "WHERE u.id=%s LIMIT 1",
        (institution, envelope, case.user),
    )
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("""UPDATE applications SET answers='{"privateNote":"plaintext"}' WHERE id='m12-app'""")
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("UPDATE applications SET sensitive_answers='plaintext' WHERE id='m12-app'")
    stored = db.execute("SELECT answers,sensitive_answers FROM applications WHERE id='m12-app'").fetchone()
    assert stored == ({"interest": "music"}, envelope)
    db.execute(
        "INSERT INTO admission_offers (id,tenant_id,application_id,expires_on,status) "
        "VALUES ('m12-offer',%s,'m12-app',current_date,'open')",
        (tenant,),
    )
    db.execute(
        "INSERT INTO waitlist_entries (id,tenant_id,application_id,program_id,position) "
        "VALUES ('m12-wait',%s,'m12-app','m12-apply',1)",
        (tenant,),
    )
    case.app.dependency_overrides[cipher_of] = lambda: cipher
    try:
        application = client.get(f"{BASE}/applications").json()["items"][0]
        assert application["answers"] == {"interest": "music", "privateNote": "test answer"}
        assert "sensitiveAnswers" not in application
    finally:
        del case.app.dependency_overrides[cipher_of]
        asyncio.run(http.aclose())
    assert client.get(f"{BASE}/admission-offers").json()["items"][0]["id"] == "m12-offer"
    assert client.get(f"{BASE}/waitlist").json()["items"][0]["position"] == 1
    models = (Enquiry, Application, AdmissionOffer, WaitlistEntry)
    other = db.execute("SELECT id FROM tenants WHERE id<>%s LIMIT 1", (tenant,)).fetchone()
    assert other is not None
    with db.transaction():
        db.execute("SET LOCAL ROLE nexus_app")
        db.execute("SELECT set_config('app.tenant_id',%s,true)", (other[0],))
        for model in models:
            table = model.__tablename__
            privileges_query = (
                "SELECT relrowsecurity,relforcerowsecurity,has_table_privilege(oid,'INSERT') "
                "FROM pg_class WHERE oid=%s::regclass"
            )
            flags = db.execute(privileges_query, (table,)).fetchone()
            assert flags == (True, True, table == "enquiries")
            rows = db.execute(sql.SQL("SELECT * FROM {}").format(sql.Identifier(table)))
            assert rows.fetchall() == []
            assert {col.name for col in rows.description or ()} == set(model.__table__.columns.keys())
