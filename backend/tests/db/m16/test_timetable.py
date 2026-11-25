"""M16 timetable on the real backend (NEX-187): lists, visibility, slot creation order and clashes, teacher load,
audit without values, forced RLS and grants."""

import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.modules.m16.models import BellSchedule, Room, TimetableSlot
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13.test_learner_records import guardian
from tests.fake_keycloak import FakeKeycloak

API = "/api/v1/"
YEAR, ARJUN, PRIYA = "cal-ls-2026", "rp-ls-arjun-staff", "rp-ls-priya-staff"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
MODELS = (Room, BellSchedule, TimetableSlot)
INPUT: dict[str, Any] = {
    "academicYearId": YEAR,
    "periodId": None,
    "subjectOfferingId": "m16-off",
    "weekday": 2,
    "start": "09:00",
    "end": "09:45",
    "roomId": "m16-room",
    "staffProfileIds": [ARJUN],
    "effectiveFrom": "2026-06-01",
    "effectiveTo": None,
}
PERIODS = [
    {"code": "P1", "label": "Period 1", "start": "09:00", "end": "09:45", "isBreak": False},
    {"code": "BR", "label": "Break", "start": "09:45", "end": "10:00", "isBreak": True},
]


def csrf(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


def _slot(
    conn: Any, slot: str, offering: str, start: str, end: str, room: str | None, staff: list[str], period: str | None
) -> None:
    conn.execute(
        text(
            "INSERT INTO timetable_slots (id, tenant_id, academic_year_id, period_id, subject_offering_id, weekday, "
            "start, \"end\", room_id, staff_profile_ids, effective_from) VALUES (:id, 'ten-ls', :y, :p, :o, 1, :s, :e, "
            ":r, :staff, '2026-06-01')"
        ),
        {"id": slot, "y": YEAR, "p": period, "o": offering, "s": start, "e": end, "r": room, "staff": staff},
    )


@pytest.fixture
def timetable(test_db: DbUrls) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        child = conn.execute(
            text(
                "SELECT rp.id FROM role_profiles rp JOIN guardian_links gl ON gl.learner_person_id = rp.person_id "
                "JOIN role_profiles g ON g.person_id = gl.guardian_person_id "
                "WHERE rp.kind = 'learner' AND rp.tenant_id = 'ten-ls' AND g.id = 'rp-ls-sunita-guardian' "
                "ORDER BY rp.id LIMIT 1"
            )
        ).scalar_one()
        conn.execute(
            text(
                "INSERT INTO learners (id, tenant_id, institution_id, campus_id, person_id, role_profile_id, "
                "learner_number, status, admission_date, retention_state, custom_fields) SELECT 'm16-a', tenant_id, "
                "institution_id, campus_id, person_id, id, 'M16A', 'enrolled', '2026-01-01', 'active', '{}' "
                "FROM role_profiles WHERE id = :p"
            ),
            {"p": child},
        )
        conn.execute(
            text(
                "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) "
                "VALUES ('m16-pr', 'ten-ls', 'ins-ls', 'M16', 'Program', 'course', true)"
            )
        )
        for group in ("m16-cg", "m16-cg2"):
            conn.execute(
                text(
                    "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, kind, "
                    "code, name) VALUES (:g, 'ten-ls', 'ins-ls', :y, 'm16-pr', 'group', :g, 'Group')"
                ),
                {"g": group, "y": YEAR},
            )
        conn.execute(
            text(
                "INSERT INTO enrolments (id, tenant_id, learner_id, academic_year_id, program_id, class_group_id, "
                "status, effective_from) VALUES ('m16-en', 'ten-ls', 'm16-a', :y, 'm16-pr', 'm16-cg', 'active', "
                "'2026-01-01')"
            ),
            {"y": YEAR},
        )
        conn.execute(
            text(
                "INSERT INTO subjects (id, tenant_id, institution_id, code, name, kind, active) "
                "VALUES ('m16-sub', 'ten-ls', 'ins-ls', 'M16S', 'Subject', 'core', true)"
            )
        )
        for offering, group in (("m16-off", "m16-cg"), ("m16-off2", "m16-cg2")):
            conn.execute(
                text(
                    "INSERT INTO subject_offerings (id, tenant_id, academic_year_id, class_group_id, subject_id, "
                    "staff_profile_ids) VALUES (:o, 'ten-ls', :y, :g, 'm16-sub', '{}')"
                ),
                {"o": offering, "g": group, "y": YEAR},
            )
        for room in ("m16-room", "m16-room2"):
            conn.execute(
                text(
                    "INSERT INTO rooms (id, tenant_id, institution_id, code, name, kind, capacity, active) "
                    "VALUES (:r, 'ten-ls', 'ins-ls', :r, 'Room', 'classroom', 30, true)"
                ),
                {"r": room},
            )
        conn.execute(
            text(
                "INSERT INTO bell_schedules (id, tenant_id, institution_id, name, periods) "
                "VALUES ('m16-bell', 'ten-ls', 'ins-ls', 'Day', CAST(:p AS jsonb))"
            ),
            {"p": json.dumps(PERIODS)},
        )
        _slot(conn, "m16-s1", "m16-off", "09:00", "09:45", "m16-room", [ARJUN], None)
        _slot(conn, "m16-s2", "m16-off2", "10:00", "10:45", None, [PRIYA], "per-ls-t1")
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM timetable_slots WHERE subject_offering_id LIKE 'm16-%'"))
            for table, ids in (
                ("bell_schedules", ["m16-bell"]),
                ("rooms", ["m16-room", "m16-room2"]),
                ("subject_offerings", ["m16-off", "m16-off2"]),
                ("subjects", ["m16-sub"]),
                ("enrolments", ["m16-en"]),
                ("class_groups", ["m16-cg", "m16-cg2"]),
                ("programs", ["m16-pr"]),
                ("learners", ["m16-a"]),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
        engine.dispose()


def ids(res: Any) -> list[str]:
    assert res.status_code == 200, res.text
    return [row["id"] for row in res.json()["items"]]


def test_lists_and_slot_visibility(client: TestClient, kc: FakeKeycloak, timetable: Engine) -> None:
    sign_in(client, kc)
    rooms = client.get(API + "rooms", params={"pageSize": 100}).json()["items"]
    room = next(row for row in rooms if row["id"] == "m16-room")
    assert room["capacity"] == 30 and room["campusId"] is None and room["createdAt"].endswith("Z")
    bell = next(row for row in client.get(API + "bell-schedules").json()["items"] if row["id"] == "m16-bell")
    assert bell["periods"] == PERIODS
    assert ids(client.get(API + "timetable-slots")) == ["m16-s1", "m16-s2"]
    assert ids(client.get(API + "timetable-slots", params={"classGroupId": "m16-cg2"})) == ["m16-s2"]
    assert ids(client.get(API + "timetable-slots", params={"staffProfileId": PRIYA})) == ["m16-s2"]
    assert ids(client.get(API + "timetable-slots", params={"pageSize": 1, "page": 2})) == ["m16-s2"]
    for params in ({"classGroupId": "m16-nope"}, {"staffProfileId": "rp-ls-sunita-guardian"}):
        assert client.get(API + "timetable-slots", params=params).status_code == 404
    slot = client.get(API + "timetable-slots").json()["items"][0]
    assert {k: slot[k] for k in ("weekday", "start", "end", "effectiveFrom", "effectiveTo", "periodId")} == {
        "weekday": 1,
        "start": "09:00",
        "end": "09:45",
        "effectiveFrom": "2026-06-01",
        "effectiveTo": None,
        "periodId": None,
    }
    guardian(client, kc, timetable)  # only the slots of their child's class group
    assert ids(client.get(API + "timetable-slots")) == ["m16-s1"]
    assert client.get(API + "teacher-load").status_code == 403


def test_create_slot_and_audit(client: TestClient, kc: FakeKeycloak, timetable: Engine) -> None:
    sign_in(client, kc)
    res = client.post(API + "timetable-slots", json=INPUT, headers=csrf(client))
    assert res.status_code == 201, res.text
    slot = res.json()
    assert slot == {
        **INPUT,
        "id": slot["id"],
        "tenantId": "ten-ls",
        "createdAt": slot["createdAt"],
        "updatedAt": slot["updatedAt"],
    }
    assert slot["id"].startswith("tts-")
    with timetable.connect() as conn:
        event = conn.execute(
            text("SELECT action, changes FROM audit_events WHERE target_id = :id"), {"id": slot["id"]}
        ).one()
    assert event.action == "m16.timetableSlot.created"
    assert {c["field"] for c in event.changes} == set(INPUT) and "09:00" not in json.dumps(event.changes)


def test_bad_bodies_and_references(client: TestClient, kc: FakeKeycloak, timetable: Engine) -> None:
    sign_in(client, kc)
    fields: list[tuple[dict[str, Any], list[str]]] = [
        ({"weekday": 8}, ["weekday"]),
        ({"weekday": "2"}, ["weekday"]),
        ({"start": "9:00", "end": "24:00"}, ["start", "end"]),
        ({"end": "08:00"}, ["end"]),
        ({"staffProfileIds": [ARJUN, ARJUN]}, ["staffProfileIds"]),
        ({"effectiveTo": "2026-01-01"}, ["effectiveTo"]),
        ({"effectiveFrom": "2026-6-1"}, ["effectiveFrom"]),
    ]
    for change, paths in fields:
        res = client.post(API + "timetable-slots", json={**INPUT, **change}, headers=csrf(client))
        assert res.status_code == 400, change
        assert [d["path"] for d in res.json()["error"]["details"]] == paths, change
        assert all(d["message"] == "Invalid timetable slot field" for d in res.json()["error"]["details"])
    for body in ({**INPUT, "extra": 1}, "{"):
        res = client.post(
            API + "timetable-slots",
            content=body if isinstance(body, str) else json.dumps(body),
            headers={**csrf(client), "content-type": "application/json"},
        )
        assert res.status_code == 400 and "details" not in res.json()["error"]
    references: list[tuple[dict[str, Any], str, str]] = [
        ({"academicYearId": "cal-rv-2026"}, "academicYearId", "Academic year does not belong to this tenant"),
        ({"periodId": "per-x"}, "periodId", "Academic period does not belong to this academic year"),
        ({"subjectOfferingId": "m16-nope"}, "subjectOfferingId", "Subject offering does not belong to this tenant"),
        ({"roomId": "m16-nope"}, "roomId", "Room does not belong to this tenant"),
        (
            {"staffProfileIds": ["rp-ls-sunita-guardian"]},
            "staffProfileIds",
            "Staff profile does not belong to this tenant",
        ),
    ]
    for change, path, message in references:
        res = client.post(API + "timetable-slots", json={**INPUT, **change}, headers=csrf(client))
        assert res.status_code == 400 and res.json()["error"]["details"] == [{"path": path, "message": message}]


def test_clashes(client: TestClient, kc: FakeKeycloak, timetable: Engine) -> None:
    sign_in(client, kc)
    base = {**INPUT, "weekday": 1, "start": "09:30", "end": "10:15", "staffProfileIds": []}
    cases: list[tuple[dict[str, Any], str]] = [
        ({"roomId": "m16-room"}, "roomId"),
        ({"roomId": None, "staffProfileIds": [ARJUN]}, "staffProfileIds"),
        ({"roomId": None}, "subjectOfferingId"),
    ]
    for change, path in cases:
        res = client.post(API + "timetable-slots", json={**base, **change}, headers=csrf(client))
        assert res.status_code == 409 and res.json()["error"]["details"][0]["path"] == path, change
    later = {**base, "roomId": None, "effectiveFrom": "2026-01-01", "effectiveTo": "2026-05-31"}  # ends before s1
    assert client.post(API + "timetable-slots", json=later, headers=csrf(client)).status_code == 201
    other = {**base, "roomId": "m16-room2", "subjectOfferingId": "m16-off2", "start": "09:00", "end": "09:30"}
    assert client.post(API + "timetable-slots", json=other, headers=csrf(client)).status_code == 201


def test_teacher_load(client: TestClient, kc: FakeKeycloak, timetable: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    loads = client.get(API + "teacher-load", params={"academicYearId": YEAR, "pageSize": 100}).json()["items"]
    mine = [row for row in loads if row["staffProfileId"] in (ARJUN, PRIYA)]
    assert mine == [
        {
            "staffProfileId": ARJUN,
            "academicYearId": YEAR,
            "periodId": None,
            "weeklyPeriods": 1,
            "weeklyMinutes": 45,
            "maxWeeklyPeriods": None,
            "overloaded": False,
        },
        {
            "staffProfileId": PRIYA,
            "academicYearId": YEAR,
            "periodId": "per-ls-t1",
            "weeklyPeriods": 1,
            "weeklyMinutes": 45,
            "maxWeeklyPeriods": None,
            "overloaded": False,
        },
    ]
    assert client.get(API + "teacher-load", params={"academicYearId": "cal-nope"}).status_code == 404


def test_guard_order(client: TestClient, kc: FakeKeycloak, timetable: Engine) -> None:
    sign_in(client, kc, **TEACHER)  # no m16.timetable.manage
    denied = client.post(API + "timetable-slots", content="{", headers=csrf(client))
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "forbidden"
    switch = text("UPDATE entitlements SET source = :s, enabled = :e WHERE tenant_id = 'ten-ls' AND module_id = 'M16'")
    with timetable.begin() as conn:
        conn.execute(switch, {"s": "plan", "e": False})
    try:
        for res in (client.get(API + "rooms"), client.post(API + "timetable-slots", content="{", headers=csrf(client))):
            assert res.status_code == 403 and res.json()["error"]["code"] == "module_disabled"
    finally:
        with timetable.begin() as conn:
            conn.execute(switch, {"s": "core", "e": True})


def test_rls_grants_and_models(test_db: DbUrls, timetable: Engine) -> None:
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            for name in ("rooms", "bell_schedules", "timetable_slots"):
                assert conn.scalar(text(f"SELECT count(*) FROM {name} WHERE id LIKE 'm16-%'")) == 0  # noqa: S608
        with pytest.raises(DBAPIError), app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
            conn.execute(text("UPDATE timetable_slots SET weekday = 3"))
    finally:
        app.dispose()
    with timetable.connect() as conn:
        for bad in ("\"end\" = '08:00'", "start = '9:00'", "weekday = 9", "staff_profile_ids = ARRAY['a','a']"):
            with pytest.raises(DBAPIError), conn.begin():
                conn.execute(text(f"UPDATE timetable_slots SET {bad} WHERE id = 'm16-s1'"))  # noqa: S608
        inspector = inspect(conn)
        for model in MODELS:
            name = str(model.__tablename__)
            table = Base.metadata.tables[name]
            assert {c["name"]: c["nullable"] for c in inspector.get_columns(name)} == {
                c.name: c.nullable for c in table.columns
            }
            assert {tuple(u["column_names"]) for u in inspector.get_unique_constraints(name)} == {
                tuple(c.name for c in u.columns) for u in table.constraints if isinstance(u, UniqueConstraint)
            }
            flags = conn.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'SELECT'), "
                    "has_table_privilege('nexus_app', oid, 'INSERT'), has_table_privilege('nexus_app', oid, 'UPDATE') "
                    "FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            assert tuple(flags) == (True, True, True, name == "timetable_slots", False)
            assert conn.scalar(text("SELECT policyname FROM pg_policies WHERE tablename = :n"), {"n": name}) == (
                "tenant_isolation"
            )
