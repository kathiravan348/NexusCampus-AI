"""M17 attendance on the real backend (NEX-205): reads, masking, roster order, mark creation and replay, encrypted
notes and reasons with sensitive-read audit, forced RLS and grants."""

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
from nexus.modules.m17.models import AttendanceMark, AttendanceSession, LeaveRequest
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13 import test_learner_records as m13
from tests.fake_keycloak import FakeKeycloak

m13_vault = m13.m13_vault
guardian = m13.guardian
API = "/api/v1/"
YEAR, ARJUN, PRIYA = "cal-ls-2026", "rp-ls-arjun-staff", "rp-ls-priya-staff"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
MODELS = (AttendanceSession, AttendanceMark, LeaveRequest)
NOTE, REASON = "Test note value", "Test reason value"
LEARNERS = {
    "m17-a": ("rp-ls-rohan-learner", "10"),
    "m17-b": ("rp-ls-anaya-learner", "2"),
    "m17-c": ("rp-ls-kavya-learner", None),
}
MARK: dict[str, Any] = {"learnerId": "m17-a", "status": "late", "minutesLate": 5, "note": "Test new note"}


def csrf(client: TestClient, key: str | None = None) -> dict[str, str]:
    headers = {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}
    return {**headers, "Idempotency-Key": key} if key else headers


def seal(vault: Vault, field: str, value: str) -> str:
    return asyncio.run(FieldCipher(vault).encrypt(key_name("ten-ls", "tenant_data"), field, value))


@pytest.fixture
def attendance(test_db: DbUrls, m13_vault: Vault) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        for learner, (profile, _) in LEARNERS.items():
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
                "VALUES ('m17-pr', 'ten-ls', 'ins-ls', 'M17', 'Program', 'course', true)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, kind, code, "
                "name) VALUES ('m17-cg', 'ten-ls', 'ins-ls', :y, 'm17-pr', 'group', 'M17', 'Group')"
            ),
            {"y": YEAR},
        )
        for learner, (_, roll) in LEARNERS.items():
            start = "2026-12-01" if learner == "m17-c" else "2026-01-01"  # m17-c joins after the session date
            conn.execute(
                text(
                    "INSERT INTO enrolments (id, tenant_id, learner_id, academic_year_id, program_id, class_group_id, "
                    "roll_number, status, effective_from) VALUES (:id, 'ten-ls', :l, :y, 'm17-pr', 'm17-cg', :r, "
                    "'active', :s)"
                ),
                {"id": f"{learner}-en", "l": learner, "y": YEAR, "r": roll, "s": start},
            )
        conn.execute(
            text(
                "INSERT INTO attendance_sessions (id, tenant_id, institution_id, mode, date, class_group_id, status) "
                "VALUES ('m17-s1', 'ten-ls', 'ins-ls', 'daily', '2026-06-01', 'm17-cg', 'open')"
            )
        )
        conn.execute(
            text(
                "INSERT INTO attendance_sessions (id, tenant_id, institution_id, mode, date, event_label, status, "
                "submitted_at, taken_by_staff_profile_id) VALUES ('m17-s2', 'ten-ls', 'ins-ls', 'event', "
                "'2026-06-02', 'Trip', 'submitted', now(), :p)"
            ),
            {"p": ARJUN},
        )
        for mark, learner, note in (
            ("m17-m1", "m17-a", seal(m13_vault, "attendance_marks.note", NOTE)),
            ("m17-m2", "m17-b", None),
        ):
            conn.execute(
                text(
                    "INSERT INTO attendance_marks (id, tenant_id, session_id, learner_id, status, note, method, "
                    "marked_by_staff_profile_id) VALUES (:id, 'ten-ls', 'm17-s1', :l, 'present', :n, 'manual', :p)"
                ),
                {"id": mark, "l": learner, "n": note, "p": ARJUN},
            )
        reason = seal(m13_vault, "leave_requests.reason", REASON)
        conn.execute(
            text(
                'INSERT INTO leave_requests (id, tenant_id, learner_id, requested_by_person_id, "from", "to", reason, '
                "status) VALUES ('m17-l1', 'ten-ls', 'm17-a', 'per-ls-sunita', '2026-06-03', '2026-06-04', :r, "
                "'pending')"
            ),
            {"r": reason},
        )
        conn.execute(
            text(
                'INSERT INTO leave_requests (id, tenant_id, learner_id, requested_by_person_id, "from", "to", reason, '
                "status, decided_by_staff_profile_id, decided_at) VALUES ('m17-l2', 'ten-ls', 'm17-b', "
                "'per-ls-deepak', '2026-06-03', '2026-06-03', :r, 'approved', :p, now())"
            ),
            {"r": reason, "p": PRIYA},
        )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM attendance_marks WHERE session_id LIKE 'm17-%'"))
            for table, ids in (
                ("leave_requests", ["m17-l1", "m17-l2"]),
                ("attendance_sessions", ["m17-s1", "m17-s2"]),
                ("enrolments", [f"{learner}-en" for learner in LEARNERS]),
                ("class_groups", ["m17-cg"]),
                ("programs", ["m17-pr"]),
                ("learners", list(LEARNERS)),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
        engine.dispose()


def items(res: Any) -> list[dict[str, Any]]:
    assert res.status_code == 200, res.text
    return list(res.json()["items"])


def sensitive_reads(engine: Engine, action: str) -> int:
    with engine.connect() as conn:
        return int(conn.scalar(text("SELECT count(*) FROM audit_events WHERE action = :a"), {"a": action}) or 0)


def test_sessions_and_roster(client: TestClient, kc: FakeKeycloak, attendance: Engine) -> None:
    sign_in(client, kc)
    assert [s["id"] for s in items(client.get(API + "attendance-sessions"))] == ["m17-s1", "m17-s2"]
    assert [s["id"] for s in items(client.get(API + "attendance-sessions", params={"classGroupId": "m17-cg"}))] == [
        "m17-s1"
    ]
    assert client.get(API + "attendance-sessions", params={"classGroupId": "nope"}).status_code == 404
    roster = items(client.get(API + "attendance-sessions/m17-s1/roster"))
    assert roster == [{"learnerId": "m17-b", "rollNumber": "2"}, {"learnerId": "m17-a", "rollNumber": "10"}]
    assert items(client.get(API + "attendance-sessions/m17-s2/roster")) == []
    assert client.get(API + "attendance-sessions/nope/roster").status_code == 404
    guardian(client, kc, attendance)
    assert client.get(API + "attendance-sessions/m17-s1/roster").status_code == 403


def test_marks_masking_and_sensitive_read(client: TestClient, kc: FakeKeycloak, attendance: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    before = sensitive_reads(attendance, "m17.attendanceMark.sensitiveRead")
    marks = items(client.get(API + "attendance-sessions/m17-s1/marks"))
    assert [(m["id"], m["note"]) for m in marks] == [("m17-m1", NOTE), ("m17-m2", None)]
    assert sensitive_reads(attendance, "m17.attendanceMark.sensitiveRead") == before + 1
    guardian(client, kc, attendance)  # family only, no note without the mark permission
    marks = items(client.get(API + "attendance-sessions/m17-s1/marks"))
    assert [(m["id"], m["note"]) for m in marks] == [("m17-m1", None)]
    assert sensitive_reads(attendance, "m17.attendanceMark.sensitiveRead") == before + 1


def test_leave_requests(client: TestClient, kc: FakeKeycloak, attendance: Engine) -> None:
    sign_in(client, kc)
    rows = [r for r in items(client.get(API + "leave-requests")) if r["id"].startswith("m17-")]
    assert [(r["id"], r["reason"], r["from"], r["to"]) for r in rows] == [
        ("m17-l1", REASON, "2026-06-03", "2026-06-04"),
        ("m17-l2", REASON, "2026-06-03", "2026-06-03"),
    ]
    assert sensitive_reads(attendance, "m17.leaveRequest.sensitiveRead") >= 1
    sign_in(client, kc, **TEACHER)  # staff without m17.leave.decide
    assert client.get(API + "leave-requests").status_code == 403
    guardian(client, kc, attendance)
    assert [r["id"] for r in items(client.get(API + "leave-requests"))] == ["m17-l1"]


def test_create_mark_and_replay(client: TestClient, kc: FakeKeycloak, attendance: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    url = API + "attendance-sessions/m17-s1/marks"
    first = client.post(url, json=MARK, headers=csrf(client, "m17-key-1"))
    assert first.status_code == 201, first.text
    mark = first.json()
    assert {k: mark[k] for k in ("sessionId", "method", "markedByStaffProfileId", "deviceId", "note")} == {
        "sessionId": "m17-s1",
        "method": "manual",
        "markedByStaffProfileId": ARJUN,
        "deviceId": None,
        "note": MARK["note"],
    }
    again = client.post(url, json=MARK, headers=csrf(client, "m17-key-1"))  # offline outbox replay
    assert again.status_code == 201 and again.json() == mark
    with attendance.connect() as conn:
        stored = conn.scalar(text("SELECT note FROM attendance_marks WHERE id = :id"), {"id": mark["id"]})
        events = conn.execute(
            text("SELECT changes FROM audit_events WHERE action = 'm17.attendanceMark.created' AND target_id = :id"),
            {"id": mark["id"]},
        ).all()
    assert stored and stored.startswith("v1:") and MARK["note"] not in stored
    assert len(events) == 1 and MARK["note"] not in json.dumps(events[0].changes)
    assert {"field": "note", "sensitive": True} in events[0].changes


def test_mark_errors_and_guard_order(client: TestClient, kc: FakeKeycloak, attendance: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    url = API + "attendance-sessions/m17-s1/marks"
    closed = client.post(API + "attendance-sessions/m17-s2/marks", json=MARK, headers=csrf(client))
    assert closed.status_code == 409 and closed.json()["error"]["details"] == [
        {"path": "status", "message": "Session is closed"}
    ]
    assert client.post(API + "attendance-sessions/nope/marks", json=MARK, headers=csrf(client)).status_code == 404
    cases: list[tuple[Any, str]] = [
        ({**MARK, "minutesLate": None}, "minutesLate"),
        ({**MARK, "minutesLate": 0}, "minutesLate"),
        ({**MARK, "note": "x" * 301}, "note"),
        ({**MARK, "extra": 1}, ""),
        ({**MARK, "learnerId": "m17-c"}, "learnerId"),
    ]
    for body, path in cases:
        res = client.post(url, json=body, headers=csrf(client))
        assert res.status_code == 400 and path in [d["path"] for d in res.json()["error"]["details"]], body
    bad = client.post(url, content="{", headers={**csrf(client), "content-type": "application/json"})
    assert bad.status_code == 400 and bad.json()["error"]["details"][0]["path"] == ""
    guardian(client, kc, attendance)  # no m17.attendance.mark
    assert client.post(url, content="{", headers=csrf(client)).status_code == 403
    sign_in(client, kc, **TEACHER)
    profile = text("UPDATE role_profiles SET status = :s WHERE id = :p")
    with attendance.begin() as conn:
        conn.execute(profile, {"s": "inactive", "p": ARJUN})
    try:
        res = client.post(API + "attendance-sessions/nope/marks", content="{", headers=csrf(client))
        assert res.status_code == 403  # no active staff profile: before the session and the body
    finally:
        with attendance.begin() as conn:
            conn.execute(profile, {"s": "active", "p": ARJUN})
    switch = text("UPDATE entitlements SET source = :s, enabled = :e WHERE tenant_id = 'ten-ls' AND module_id = 'M17'")
    with attendance.begin() as conn:
        conn.execute(switch, {"s": "plan", "e": False})
    try:
        for res in (client.get(API + "leave-requests"), client.post(url, content="{", headers=csrf(client))):
            assert res.status_code == 403 and res.json()["error"]["code"] == "module_disabled"
    finally:
        with attendance.begin() as conn:
            conn.execute(switch, {"s": "core", "e": True})


def test_storage_rls_grants_and_models(test_db: DbUrls, attendance: Engine) -> None:
    assert ENCRYPTED_COLUMNS[("attendance_marks", "note")].field == "attendance_marks.note"
    assert ENCRYPTED_COLUMNS[("leave_requests", "reason")].field == "leave_requests.reason"
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            for name in ("attendance_sessions", "attendance_marks", "leave_requests"):
                assert conn.scalar(text(f"SELECT count(*) FROM {name} WHERE id LIKE 'm17-%'")) == 0  # noqa: S608
        for statement in ("UPDATE attendance_marks SET status = 'absent'", "DELETE FROM attendance_marks"):
            with pytest.raises(DBAPIError), app.begin() as conn:
                conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
                conn.execute(text(statement))
    finally:
        app.dispose()
    with attendance.connect() as conn:
        for bad in ("note = 'plain text'", "status = 'late'", "minutes_late = 5"):
            with pytest.raises(DBAPIError), conn.begin():
                conn.execute(text(f"UPDATE attendance_marks SET {bad} WHERE id = 'm17-m1'"))  # noqa: S608
        with pytest.raises(DBAPIError), conn.begin():
            conn.execute(text("UPDATE leave_requests SET reason = 'plain text' WHERE id = 'm17-l1'"))
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
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'SELECT'), "
                    "has_table_privilege('nexus_app', oid, 'INSERT'), has_table_privilege('nexus_app', oid, 'UPDATE') "
                    "FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            assert tuple(flags) == (True, True, True, name == "attendance_marks", False)
            assert conn.scalar(text("SELECT policyname FROM pg_policies WHERE tablename = :n"), {"n": name}) == (
                "tenant_isolation"
            )
