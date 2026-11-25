"""M15 API, tenant boundaries, database constraints and frozen response shapes."""

from collections.abc import Iterator
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.exc import IntegrityError

from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.modules.m15.models import ClassGroup, Program, Subject, SubjectOffering, YearLevel
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

API = "/api/v1/"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
GROUP: dict[str, object] = {
    "programId": "m15-ls",
    "academicYearId": "cal-ls-2026",
    "campusId": "cmp-ls-main",
    "yearLevelId": "m15-ls-level",
    "kind": "section",
    "code": "New_1",
    "name": "New group",
    "capacity": 20,
    "homeroomStaffProfileId": "rp-ls-arjun-staff",
}
STAMPED = {"id", "tenantId", "createdAt", "updatedAt"}
SHAPES = {
    "programs": STAMPED | {"institutionId", "code", "name", "kind", "durationYears", "active"},
    "year-levels": {"id", "tenantId", "programId", "code", "name", "order"},
    "class-groups": STAMPED | {"institutionId", *GROUP},
    "subjects": STAMPED | {"institutionId", "name", "code", "kind", "credits", "active"},
    "subject-offerings": STAMPED
    | {"classGroupId", "subjectId", "academicYearId", "periodId", "staffProfileIds", "weeklyPeriods"},
}


def csrf(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


@pytest.fixture
def academics(test_db: DbUrls) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        for slug in ("ls", "rv"):
            p = {"tenant": f"ten-{slug}", "ins": f"ins-{slug}", "program": f"m15-{slug}", "cal": f"cal-{slug}-2026"}
            conn.execute(
                text(
                    "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) "
                    "VALUES (:program, :tenant, :ins, 'A', 'Program', 'course', true)"
                ),
                p,
            )
            conn.execute(
                text(
                    'INSERT INTO year_levels (id, tenant_id, program_id, code, name, "order") '
                    "VALUES (:id, :tenant, :program, 'Y', 'Year', 1)"
                ),
                {**p, "id": f"m15-{slug}-level"},
            )
            conn.execute(
                text(
                    "INSERT INTO subjects (id, tenant_id, institution_id, code, name, kind, credits, active) "
                    "VALUES (:id, :tenant, :ins, 'SUB', 'Subject', 'core', 1.5, true)"
                ),
                {**p, "id": f"m15-{slug}-sub"},
            )
            conn.execute(
                text(
                    "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, kind, "
                    "code, name) VALUES (:id, :tenant, :ins, :cal, :program, 'batch', 'G', 'Group')"
                ),
                {**p, "id": f"m15-{slug}-group"},
            )
            conn.execute(
                text(
                    "INSERT INTO subject_offerings (id, tenant_id, academic_year_id, class_group_id, subject_id, "
                    "staff_profile_ids) VALUES (:id, :tenant, :cal, :grp, :sub, '{}')"
                ),
                {**p, "id": f"m15-{slug}-off", "grp": f"m15-{slug}-group", "sub": f"m15-{slug}-sub"},
            )
        conn.execute(
            text(
                "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) "
                "VALUES ('m15-ls-alt', 'ten-ls', 'ins-ls', 'B', 'Other program', 'degree', true)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO academic_calendars (id, tenant_id, institution_id, academic_year, starts_on, "
                "ends_on, display_calendar, periods, holidays) VALUES ('m15-cal', 'ten-ls', 'ins-ls', "
                "'2027-28', '2027-06-01', '2028-03-31', 'gregory', '[]', '[]')"
            )
        )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM subject_offerings WHERE id IN ('m15-ls-off', 'm15-rv-off')"))
            conn.execute(text("DELETE FROM class_groups WHERE program_id IN ('m15-ls', 'm15-rv', 'm15-ls-alt')"))
            conn.execute(text("DELETE FROM subjects WHERE id IN ('m15-ls-sub', 'm15-rv-sub')"))
            conn.execute(text("DELETE FROM year_levels WHERE id IN ('m15-ls-level', 'm15-rv-level')"))
            conn.execute(text("DELETE FROM programs WHERE id IN ('m15-ls', 'm15-rv', 'm15-ls-alt')"))
            conn.execute(text("DELETE FROM academic_calendars WHERE id = 'm15-cal'"))
        engine.dispose()


@pytest.mark.usefixtures("academics")
def test_read_routes_and_tenant_boundaries(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **TEACHER)
    for route, fields in SHAPES.items():
        response = client.get(API + route)
        assert response.status_code == 200, response.text
        page = response.json()
        assert set(page) == {"items", "total", "page", "pageSize"}
        assert page["total"] == len(page["items"]) == (2 if route == "programs" else 1)
        for row in page["items"]:
            assert set(row) == fields and row["tenantId"] == "ten-ls"
            if "createdAt" in row:
                assert row["createdAt"].endswith("Z") and row["updatedAt"].endswith("Z")
                assert datetime.fromisoformat(row["createdAt"]) <= datetime.fromisoformat(row["updatedAt"])
    page = client.get(API + "programs", params={"page": 2, "pageSize": 1}).json()
    assert (page["total"], page["page"], page["pageSize"]) == (2, 2, 1)
    assert [row["id"] for row in page["items"]] == ["m15-ls-alt"]
    assert page["items"][0]["durationYears"] is None
    assert client.get(API + "subjects").json()["items"][0]["credits"] == 1.5
    offerings = API + "subject-offerings"
    row = client.get(offerings, params={"academicYearId": "cal-ls-2026"}).json()["items"][0]
    assert row["periodId"] is None and row["weeklyPeriods"] is None and row["staffProfileIds"] == []
    assert client.get(offerings, params={"academicYearId": "m15-cal"}).json()["total"] == 0
    for year in ("cal-rv-2026", "missing"):
        response = client.get(offerings, params={"academicYearId": year})
        assert response.status_code == 404 and response.json()["error"]["code"] == "not_found"


def test_create_read_back_audit_and_duplicate(client: TestClient, kc: FakeKeycloak, academics: Engine) -> None:
    sign_in(client, kc)
    url = API + "class-groups"
    result = client.post(url, json={**GROUP, "name": " New group ", "capacity": 20.0}, headers=csrf(client))
    assert result.status_code == 201, result.text
    saved = result.json()
    assert saved["id"].startswith("clg_") and saved["createdAt"] == saved["updatedAt"]
    assert set(saved) == SHAPES["class-groups"]
    assert {k: saved[k] for k in GROUP} == GROUP
    assert (saved["tenantId"], saved["institutionId"]) == ("ten-ls", "ins-ls")
    duplicate = client.post(url, json={**GROUP, "code": "NEW_1"}, headers=csrf(client))
    assert duplicate.status_code == 409 and duplicate.json()["error"]["code"] == "conflict"
    assert duplicate.json()["error"]["details"][0]["path"] == "code"
    assert saved in client.get(url).json()["items"]
    with academics.connect() as conn:
        audit = conn.execute(
            text(
                "SELECT actor_id, target_type, changes FROM audit_events WHERE tenant_id = 'ten-ls' AND "
                "action = 'm15.classGroup.created' AND target_id = :id"
            ),
            {"id": saved["id"]},
        ).one()
    assert audit.target_type == "classGroup"
    assert audit.actor_id == "usr-ls-priya" and {c["field"] for c in audit.changes} == set(GROUP)
    assert all(set(c) == {"field", "sensitive"} for c in audit.changes)
    optional = dict.fromkeys(["campusId", "yearLevelId", "capacity", "homeroomStaffProfileId"])
    second = client.post(url, json={**GROUP, **optional, "academicYearId": "m15-cal"}, headers=csrf(client))
    assert second.status_code == 201 and all(second.json()[key] is None for key in optional)


@pytest.mark.usefixtures("academics")
def test_invalid_references_follow_mock_order(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    # Every reference starts in the other tenant. Resolve them one by one, leaving a duplicate code until last.
    body: dict[str, object] = {
        **GROUP,
        "code": "g",
        "programId": "m15-rv",
        "academicYearId": "cal-rv-2026",
        "yearLevelId": "m15-rv-level",
        "campusId": "cmp-rv-north",
        "homeroomStaffProfileId": "rp-rv-helen-staff",
    }
    for field in ("programId", "academicYearId", "yearLevelId", "campusId", "homeroomStaffProfileId"):
        result = client.post(API + "class-groups", json=body, headers=csrf(client))
        assert result.status_code == 400 and result.json()["error"]["code"] == "invalid_request"
        assert [detail["path"] for detail in result.json()["error"]["details"]] == [field]
        body[field] = GROUP[field]
    for field, value, path in (
        ("programId", "m15-ls-alt", "yearLevelId"),
        ("homeroomStaffProfileId", "rp-ls-sunita-guardian", "homeroomStaffProfileId"),
    ):
        res = client.post(API + "class-groups", json={**GROUP, field: value}, headers=csrf(client))
        assert res.status_code == 400 and res.json()["error"]["details"][0]["path"] == path


def test_bad_body_paths(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    url = API + "class-groups"
    bad: list[tuple[dict[str, object], str]] = [
        ({**GROUP, "name": "  "}, "name"),
        ({**GROUP, "code": "_bad"}, "code"),
        ({**GROUP, "capacity": True}, "capacity"),
        ({**GROUP, "capacity": "1"}, "capacity"),
        ({**GROUP, "tenantId": "ten-rv"}, ""),
        ({k: v for k, v in GROUP.items() if k != "campusId"}, "campusId"),
    ]
    for body, path in bad:
        res = client.post(url, json=body, headers=csrf(client))
        assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_request"
        assert res.json()["error"]["details"][0]["path"] == path
    res = client.post(url, content="{", headers={**csrf(client), "Content-Type": "application/json"})
    assert res.status_code == 400 and res.json()["error"]["details"][0]["path"] == ""


def test_guard_precedes_body_validation(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc, **TEACHER)
    denied = client.post(API + "class-groups", json={}, headers=csrf(client))
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "forbidden"
    engine = create_engine(test_db.owner_url)
    update_switch = text(
        "UPDATE entitlements SET source = :source, enabled = :enabled WHERE tenant_id = :tenant AND module_id = :module"
    )
    target = {"tenant": "ten-ls", "module": "M15"}
    with engine.begin() as conn:
        conn.execute(update_switch, {**target, "source": "plan", "enabled": False})
    try:
        for res in (client.get(API + "programs"), client.post(API + "class-groups", json={}, headers=csrf(client))):
            assert res.status_code == 403 and res.json()["error"]["code"] == "module_disabled"
    finally:
        with engine.begin() as conn:
            conn.execute(update_switch, {**target, "source": "core", "enabled": True})
        engine.dispose()


def test_models_and_forced_rls(test_db: DbUrls) -> None:
    engine = create_engine(test_db.owner_url)
    with engine.connect() as conn:
        inspector = inspect(conn)
        for model in (Program, YearLevel, ClassGroup, Subject, SubjectOffering):
            name = str(model.__tablename__)
            table = Base.metadata.tables[name]
            actual = inspector.get_columns(name)
            columns = {c["name"]: (c["type"].compile(dialect=conn.dialect), c["nullable"]) for c in actual}
            assert columns == {c.name: (str(c.type.compile(dialect=conn.dialect)), c.nullable) for c in table.columns}
            assert inspector.get_pk_constraint(name)["constrained_columns"] == ["id"]
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
            indexes = [i for i in inspector.get_indexes(name) if not i.get("duplicates_constraint")]
            assert {(i["name"], bool(i["unique"])) for i in indexes} == {(i.name, i.unique) for i in table.indexes}
            rls = conn.execute(
                text("SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE oid = to_regclass(:name)"),
                {"name": name},
            ).one()
            assert tuple(rls) == (True, True)
            policy = conn.scalar(text("SELECT policyname FROM pg_policies WHERE tablename = :name"), {"name": name})
            assert policy == "tenant_isolation"
    engine.dispose()


def test_offering_staff_ids_constrained(academics: Engine) -> None:
    for ids in (["same", "same"], [str(i) for i in range(11)]):
        with pytest.raises(IntegrityError), academics.begin() as conn:
            conn.execute(
                text("UPDATE subject_offerings SET staff_profile_ids = :ids WHERE id = 'm15-ls-off'"), {"ids": ids}
            )
