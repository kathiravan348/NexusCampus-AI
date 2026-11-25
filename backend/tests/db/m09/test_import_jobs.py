"""M09 import jobs on the real backend (NEX-203): routes, mock order, audit without file names, forced RLS."""

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.modules.m09.models import ColumnMapping, ImportJob, ImportRowIssue
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

API = "/api/v1/import-jobs"
STAFF = "rp-ls-priya-staff"  # Priya: admin with an active staff profile
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}  # no m09.import.manage
FILE = "nex-203-private-roster.csv"
INPUT: dict[str, Any] = {"entity": "learner", "fileName": FILE, "sourceFormat": "csv"}
MODELS = (ImportJob, ColumnMapping, ImportRowIssue)
JOB = (
    "INSERT INTO import_jobs (id, tenant_id, entity, file_name, source_format, template_version, status, "
    "total_rows, valid_rows, error_rows, created_by_staff_profile_id, rollback_until, created_at, updated_at) "
    "VALUES (:id, :t, 'learner', 'seed.csv', 'csv', 1, 'dry_run_ready', 3, 2, 1, :p, NULL, :at, :at)"
)


def csrf(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


@pytest.fixture
def imports(test_db: DbUrls) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        conn.execute(text(JOB), {"id": "imp-t-1", "t": "ten-ls", "p": STAFF, "at": "2026-01-01T00:00:00Z"})
        conn.execute(text(JOB), {"id": "imp-t-2", "t": "ten-ls", "p": STAFF, "at": "2026-01-02T00:00:00Z"})
        rv_staff = conn.scalar(
            text("SELECT id FROM role_profiles WHERE tenant_id = 'ten-rv' AND kind = 'staff' LIMIT 1")
        )
        conn.execute(text(JOB), {"id": "imp-t-rv", "t": "ten-rv", "p": rv_staff, "at": "2026-01-01T00:00:00Z"})
        columns = [
            {"sourceHeader": "First name", "target": "givenName", "transform": "trim"},
            {"sourceHeader": "Notes", "target": None, "transform": "none"},
        ]
        conn.execute(
            text("INSERT INTO column_mappings (job_id, tenant_id, columns) VALUES ('imp-t-1', 'ten-ls', :c)"),
            {"c": json.dumps(columns)},
        )
        for issue, row in (("iss-b", 2), ("iss-a", 2), ("iss-c", 1)):
            conn.execute(
                text(
                    'INSERT INTO import_row_issues (id, tenant_id, job_id, row_number, "column", severity, code, '
                    "message_key) VALUES (:id, 'ten-ls', 'imp-t-1', :row, 'Date of birth', 'error', "
                    "'invalid_date', 'm09.import.invalidDate')"
                ),
                {"id": issue, "row": row},
            )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM import_row_issues WHERE id LIKE 'iss-%'"))
            conn.execute(text("DELETE FROM column_mappings WHERE job_id LIKE 'imp-t-%'"))
            conn.execute(text("DELETE FROM import_jobs WHERE id LIKE 'imp-t-%' OR file_name = :f"), {"f": FILE})
        engine.dispose()


def test_lists_order_paging_and_tenant(client: TestClient, kc: FakeKeycloak, imports: Engine) -> None:
    sign_in(client, kc)
    page = client.get(API, params={"pageSize": 1}).json()
    assert page["total"] == 2 and page["items"][0]["id"] == "imp-t-1"
    job = page["items"][0]
    assert job == {
        "id": "imp-t-1",
        "tenantId": "ten-ls",
        "entity": "learner",
        "fileName": "seed.csv",
        "sourceFormat": "csv",
        "templateVersion": 1,
        "status": "dry_run_ready",
        "totalRows": 3,
        "validRows": 2,
        "errorRows": 1,
        "createdByStaffProfileId": STAFF,
        "rollbackUntil": None,
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
    }
    assert client.get(API, params={"page": 2, "pageSize": 1}).json()["items"][0]["id"] == "imp-t-2"
    mappings = client.get(f"{API}/imp-t-1/mappings").json()
    assert mappings["total"] == 1 and mappings["items"][0]["jobId"] == "imp-t-1"
    assert mappings["items"][0]["columns"][1] == {"sourceHeader": "Notes", "target": None, "transform": "none"}
    assert client.get(f"{API}/imp-t-2/mappings").json() == {"items": [], "total": 0, "page": 1, "pageSize": 50}
    issues = client.get(f"{API}/imp-t-1/issues").json()
    assert [i["rowNumber"] for i in issues["items"]] == [1, 2, 2] and set(issues["items"][0]) == {
        "rowNumber",
        "column",
        "severity",
        "code",
        "messageKey",
    }
    assert client.get(f"{API}/imp-t-1/issues", params={"page": 2, "pageSize": 2}).json()["items"][0]["rowNumber"] == 2
    for path in ("imp-t-rv/mappings", "imp-t-rv/issues", "imp-nope/issues"):
        res = client.get(f"{API}/{path}")
        assert res.status_code == 404 and res.json()["error"]["code"] == "not_found", path


def test_create_and_audit_without_file_name(client: TestClient, kc: FakeKeycloak, imports: Engine) -> None:
    sign_in(client, kc)
    res = client.post(API, json=INPUT, headers=csrf(client))
    assert res.status_code == 201, res.text
    job = res.json()
    assert job["id"].startswith("imp-") and job["createdAt"].endswith("Z")
    assert {k: job[k] for k in ("tenantId", "status", "templateVersion", "totalRows", "rollbackUntil")} == {
        "tenantId": "ten-ls",
        "status": "uploaded",
        "templateVersion": 1,
        "totalRows": 0,
        "rollbackUntil": None,
    }
    assert job["createdByStaffProfileId"] == STAFF and job["fileName"] == FILE
    assert client.get(API).json()["items"][-1] == job
    with imports.connect() as conn:
        event = conn.execute(
            text("SELECT action, changes::text AS changes FROM audit_events WHERE target_id = :id"), {"id": job["id"]}
        ).one()
    assert event.action == "m09.importJob.created" and FILE not in event.changes and "nex-203" not in event.changes
    assert {c["field"] for c in json.loads(event.changes)} == set(INPUT)


def test_invalid_bodies(client: TestClient, kc: FakeKeycloak, imports: Engine) -> None:
    sign_in(client, kc)
    cases: list[tuple[Any, str]] = [
        ({**INPUT, "fileName": "../etc/passwd"}, "fileName"),
        ({**INPUT, "fileName": "C:roster.csv"}, "fileName"),
        ({**INPUT, "fileName": ".."}, "fileName"),
        ({**INPUT, "fileName": "  "}, "fileName"),
        ({**INPUT, "fileName": "a\tb.csv"}, "fileName"),
        ({**INPUT, "fileName": "x" * 201}, "fileName"),
        ({**INPUT, "entity": "teacher"}, "entity"),
        ({**INPUT, "extra": True}, ""),
        ([INPUT], ""),
    ]
    for body, path in cases:
        res = client.post(API, json=body, headers=csrf(client))
        assert res.status_code == 400, (body, res.text)
        assert path in {d["path"] for d in res.json()["error"]["details"]}, body
        assert "passwd" not in res.text and "roster" not in res.text
    bad = client.post(API, content="{", headers={**csrf(client), "content-type": "application/json"})
    assert bad.status_code == 400 and bad.json()["error"]["details"] == [{"path": "", "message": "Invalid JSON body"}]


def test_guard_order(client: TestClient, kc: FakeKeycloak, imports: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    denied = client.post(API, content="{", headers=csrf(client))
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "forbidden"
    sign_in(client, kc)
    profile = text("UPDATE role_profiles SET status = :s WHERE person_id = 'per-ls-priya' AND kind = 'staff'")
    with imports.begin() as conn:
        conn.execute(profile, {"s": "inactive"})
    try:  # no active staff profile: 403 before the (bad) body is read
        res = client.post(API, content="{", headers=csrf(client))
        assert res.status_code == 403 and res.json()["error"]["code"] == "forbidden"
    finally:
        with imports.begin() as conn:
            conn.execute(profile, {"s": "active"})
    switch = text("UPDATE entitlements SET source = :s, enabled = :e WHERE tenant_id = 'ten-ls' AND module_id = 'M09'")
    with imports.begin() as conn:
        conn.execute(switch, {"s": "plan", "e": False})
    try:
        for res in (client.get(API), client.post(API, content="{", headers=csrf(client))):
            assert res.status_code == 403 and res.json()["error"]["code"] == "module_disabled"
    finally:
        with imports.begin() as conn:
            conn.execute(switch, {"s": "core", "e": True})


def test_stored_data_breaking_the_contract_is_a_500(client: TestClient, kc: FakeKeycloak, imports: Engine) -> None:
    with imports.begin() as conn:
        conn.execute(
            text("UPDATE column_mappings SET columns = :c WHERE job_id = 'imp-t-1'"), {"c": json.dumps([{"x": 1}])}
        )
    sign_in(client, kc)
    res = client.get(f"{API}/imp-t-1/mappings")
    assert res.status_code == 500 and res.json()["error"]["code"] == "internal"


def test_rls_grants_checks_and_models(test_db: DbUrls, imports: Engine) -> None:
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            assert set(conn.scalars(text("SELECT id FROM import_jobs WHERE id LIKE 'imp-t-%'"))) == {"imp-t-rv"}
            assert conn.scalar(text("SELECT count(*) FROM import_row_issues")) == 0
        for statement in ("UPDATE import_jobs SET status = 'failed'", "DELETE FROM import_jobs"):
            with pytest.raises(DBAPIError), app.begin() as conn:
                conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
                conn.execute(text(statement))
    finally:
        app.dispose()
    with imports.connect() as conn:
        for bad in ("status = 'completed'", "valid_rows = 9", "file_name = 'a/b.csv'", "file_name = E'a\\x01b'"):
            with pytest.raises(DBAPIError), conn.begin():
                conn.execute(text(f"UPDATE import_jobs SET {bad} WHERE id = 'imp-t-1'"))  # noqa: S608
        inspector = inspect(conn)
        for model in MODELS:
            name = str(model.__tablename__)
            table = Base.metadata.tables[name]
            columns = {c["name"]: c["nullable"] for c in inspector.get_columns(name)}
            assert columns == {c.name: c.nullable for c in table.columns}
            assert {tuple(u["column_names"]) for u in inspector.get_unique_constraints(name)} == {
                tuple(c.name for c in u.columns) for u in table.constraints if isinstance(u, UniqueConstraint)
            }
            flags = conn.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'SELECT'), "
                    "has_table_privilege('nexus_app', oid, 'INSERT'), has_table_privilege('nexus_app', oid, 'UPDATE'), "
                    "has_table_privilege('nexus_app', oid, 'DELETE') FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            assert tuple(flags) == (True, True, True, name == "import_jobs", False, False)
            assert conn.scalar(text("SELECT policyname FROM pg_policies WHERE tablename = :n"), {"n": name}) == (
                "tenant_isolation"
            )
