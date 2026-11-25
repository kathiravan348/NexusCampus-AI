"""M21 exams on the real backend (NEX-207): reads and family scope, seat plan generation (labels, capacity, replace,
replay), the mock's error order, encrypted revaluation reasons, forced RLS and narrow grants."""

import asyncio
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
from nexus.modules.m21.models import Exam, ExamPaper, HallTicket, RevaluationRequest, SeatAssignment
from nexus.modules.m21.service import room_letters
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13 import test_learner_records as m13
from tests.fake_keycloak import FakeKeycloak

m13_vault = m13.m13_vault
guardian = m13.guardian
API = "/api/v1/"
YEAR = "cal-ls-2026"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
MODELS = (Exam, ExamPaper, SeatAssignment, HallTicket, RevaluationRequest)
LEARNERS = {
    "m21-a": ("rp-ls-rohan-learner", "10"),
    "m21-b": ("rp-ls-anaya-learner", "2"),
    "m21-c": ("rp-ls-kavya-learner", "1"),
}
REASON = "Test reason value"
# id, exam, rooms
PAPERS = [
    ("m21-p1", "m21-ex", ["m21-r1", "m21-r2"]),
    ("m21-p2", "m21-closed", ["m21-r2"]),
    ("m21-p3", "m21-ex", ["m21-r1"]),
    ("m21-p4", "m21-ex", ["m21-nope"]),
]


def csrf(client: TestClient, key: str | None = None) -> dict[str, str]:
    headers = {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}
    return {**headers, "Idempotency-Key": key} if key else headers


def _run(conn: Any, sql: str, **params: Any) -> None:
    conn.execute(text(sql), params)


@pytest.fixture
def exams(test_db: DbUrls, m13_vault: Vault) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    reason = asyncio.run(
        FieldCipher(m13_vault).encrypt(key_name("ten-ls", "tenant_data"), "revaluation_requests.reason", REASON)
    )
    with engine.begin() as conn:
        for learner, (profile, _) in LEARNERS.items():
            _run(
                conn,
                "INSERT INTO learners (id, tenant_id, institution_id, campus_id, person_id, role_profile_id, "
                "learner_number, status, admission_date, retention_state, custom_fields) SELECT :id, tenant_id, "
                "institution_id, campus_id, person_id, id, :id, 'enrolled', '2026-01-01', 'active', '{}' "
                "FROM role_profiles WHERE id = :p",
                id=learner,
                p=profile,
            )
        _run(
            conn,
            "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) "
            "VALUES ('m21-pr', 'ten-ls', 'ins-ls', 'M21', 'Program', 'course', true)",
        )
        _run(
            conn,
            "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, kind, code, "
            "name) VALUES ('m21-cg', 'ten-ls', 'ins-ls', :y, 'm21-pr', 'group', 'M21', 'Group')",
            y=YEAR,
        )
        for learner, (_, roll) in LEARNERS.items():
            _run(
                conn,
                "INSERT INTO enrolments (id, tenant_id, learner_id, academic_year_id, program_id, class_group_id, "
                "roll_number, status, effective_from) VALUES (:id, 'ten-ls', :l, :y, 'm21-pr', 'm21-cg', :r, "
                "'active', '2026-01-01')",
                id=f"{learner}-en",
                l=learner,
                y=YEAR,
                r=roll,
            )
        _run(
            conn,
            "INSERT INTO subjects (id, tenant_id, institution_id, code, name, kind, active) "
            "VALUES ('m21-sub', 'ten-ls', 'ins-ls', 'M21S', 'Subject', 'core', true)",
        )
        _run(
            conn,
            "INSERT INTO subject_offerings (id, tenant_id, academic_year_id, class_group_id, subject_id, "
            "staff_profile_ids) VALUES ('m21-off', 'ten-ls', :y, 'm21-cg', 'm21-sub', '{}')",
            y=YEAR,
        )
        for room, capacity in (("m21-r1", 2), ("m21-r2", None)):
            _run(
                conn,
                "INSERT INTO rooms (id, tenant_id, institution_id, code, name, kind, capacity, active) "
                "VALUES (:r, 'ten-ls', 'ins-ls', :r, 'Room', 'hall', :c, true)",
                r=room,
                c=capacity,
            )
        for exam, status in (("m21-ex", "scheduled"), ("m21-closed", "published")):
            _run(
                conn,
                "INSERT INTO exams (id, tenant_id, institution_id, academic_year_id, name, starts_on, ends_on, "
                "status) VALUES (:id, 'ten-ls', 'ins-ls', :y, 'Term exam', '2026-06-15', '2026-06-20', :s)",
                id=exam,
                y=YEAR,
                s=status,
            )
        for paper, exam, rooms in PAPERS:
            _run(
                conn,
                'INSERT INTO exam_papers (id, tenant_id, exam_id, subject_offering_id, date, start, "end", room_ids, '
                "max_marks) VALUES (:id, 'ten-ls', :e, 'm21-off', '2026-06-15', '09:00', '12:00', :r, 100)",
                id=paper,
                e=exam,
                r=rooms,
            )
        for ticket, learner in (("m21-t1", "m21-a"), ("m21-t2", "m21-b")):
            _run(
                conn,
                "INSERT INTO hall_tickets (id, tenant_id, exam_id, learner_id, ticket_number, issued_at, revoked) "
                "VALUES (:id, 'ten-ls', 'm21-ex', :l, :id, now(), false)",
                id=ticket,
                l=learner,
            )
        _run(
            conn,
            "INSERT INTO revaluation_requests (id, tenant_id, exam_paper_id, learner_id, reason, status, old_marks, "
            "new_marks) VALUES ('m21-rv1', 'ten-ls', 'm21-p1', 'm21-a', :r, 'changed', 40, 45.5)",
            r=reason,
        )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            for table, ids in (
                ("revaluation_requests", ["m21-rv1"]),
                ("hall_tickets", ["m21-t1", "m21-t2"]),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
            conn.execute(text("DELETE FROM seat_assignments WHERE exam_paper_id LIKE 'm21-%'"))
            for table, ids in (
                ("exam_papers", [paper[0] for paper in PAPERS]),
                ("exams", ["m21-ex", "m21-closed"]),
                ("rooms", ["m21-r1", "m21-r2"]),
                ("subject_offerings", ["m21-off"]),
                ("subjects", ["m21-sub"]),
                ("enrolments", [f"{learner}-en" for learner in LEARNERS]),
                ("class_groups", ["m21-cg"]),
                ("programs", ["m21-pr"]),
                ("learners", list(LEARNERS)),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
        engine.dispose()


def mine(res: Any) -> list[str]:
    assert res.status_code == 200, res.text
    return [row["id"] for row in res.json()["items"] if row["id"].startswith("m21-")]


def test_room_letters() -> None:
    assert [room_letters(i) for i in (0, 1, 25, 26, 27, 51, 52, 701, 702)] == [
        "A",
        "B",
        "Z",
        "AA",
        "AB",
        "AZ",
        "BA",
        "ZZ",
        "AAA",
    ]


def test_reads_and_family_scope(client: TestClient, kc: FakeKeycloak, exams: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    assert mine(client.get(API + "exams")) == ["m21-ex", "m21-closed"]
    assert mine(client.get(API + "exams/m21-ex/papers")) == ["m21-p1", "m21-p3", "m21-p4"]
    assert client.get(API + "exams/nope/papers").status_code == 404
    assert client.get(API + "exam-papers/nope/seats").status_code == 404
    assert mine(client.get(API + "hall-tickets")) == ["m21-t1", "m21-t2"]
    assert mine(client.get(API + "hall-tickets", params={"learnerId": "m21-b"})) == ["m21-t2"]
    request = client.get(API + "revaluation-requests").json()["items"][0]
    assert (request["reason"], request["oldMarks"], request["newMarks"]) == (REASON, 40, 45.5)
    guardian(client, kc, exams)
    assert mine(client.get(API + "hall-tickets")) == ["m21-t1"]
    assert client.get(API + "hall-tickets", params={"learnerId": "m21-b"}).status_code == 404
    assert mine(client.get(API + "revaluation-requests")) == ["m21-rv1"]
    assert client.get(API + "exams").status_code == 403
    with exams.connect() as conn:
        reads = conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'm21.revaluationRequest.sensitiveRead'")
        )
    assert reads == 2


def test_seat_plan(client: TestClient, kc: FakeKeycloak, exams: Engine) -> None:
    sign_in(client, kc)
    url = API + "exam-papers/m21-p1/seat-plan"
    first = client.post(url, headers=csrf(client, "m21-key-1"))
    assert first.status_code == 200, first.text
    page = first.json()
    assert (page["total"], page["page"], page["pageSize"]) == (3, 1, 200)
    assert [(s["learnerId"], s["roomId"], s["seatLabel"]) for s in page["items"]] == [
        ("m21-c", "m21-r1", "A1"),
        ("m21-b", "m21-r1", "A2"),
        ("m21-a", "m21-r2", "B1"),
    ]
    assert client.post(url, headers=csrf(client, "m21-key-1")).json() == page  # replay
    again = client.post(url, headers=csrf(client)).json()
    assert {s["id"] for s in again["items"]}.isdisjoint({s["id"] for s in page["items"]})
    seats = client.get(API + "exam-papers/m21-p1/seats").json()
    assert seats["total"] == 3 and [s["id"] for s in seats["items"]] == [s["id"] for s in again["items"]]
    with exams.connect() as conn:
        events = conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'm21.seatPlan.generated' AND target_id = 'm21-p1'")
        )
    assert events == 2


def test_seat_plan_errors_and_guard_order(client: TestClient, kc: FakeKeycloak, exams: Engine) -> None:
    sign_in(client, kc)
    closed = client.post(API + "exam-papers/m21-p2/seat-plan", headers=csrf(client))
    assert closed.status_code == 409 and closed.json()["error"]["details"] == [
        {"path": "status", "message": "Exam is closed for seating"}
    ]
    for paper, message in (("m21-p3", "Insufficient capacity"), ("m21-p4", "Invalid rooms")):
        res = client.post(API + f"exam-papers/{paper}/seat-plan", headers=csrf(client))
        assert res.status_code == 400 and res.json()["error"]["details"] == [{"path": "roomIds", "message": message}]
    assert client.post(API + "exam-papers/nope/seat-plan", headers=csrf(client)).status_code == 404
    sign_in(client, kc, **TEACHER)  # no m21.exams.manage
    denied = client.post(API + "exam-papers/m21-p1/seat-plan", headers=csrf(client))
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "forbidden"
    with exams.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM seat_assignments WHERE exam_paper_id LIKE 'm21-%'")) == 0


def test_storage_rls_grants_and_models(test_db: DbUrls, exams: Engine) -> None:
    assert ENCRYPTED_COLUMNS[("revaluation_requests", "reason")].field == "revaluation_requests.reason"
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            assert conn.scalar(text("SELECT count(*) FROM exams WHERE id LIKE 'm21-%'")) == 0
        for statement in ("UPDATE exams SET status = 'planned'", "UPDATE seat_assignments SET seat_label = 'X'"):
            with pytest.raises(DBAPIError), app.begin() as conn:
                conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
                conn.execute(text(statement))
    finally:
        app.dispose()
    with exams.connect() as conn:
        for bad in (
            "UPDATE revaluation_requests SET reason = 'plain' WHERE id = 'm21-rv1'",
            "UPDATE revaluation_requests SET status = 'unchanged' WHERE id = 'm21-rv1'",
            "UPDATE exam_papers SET room_ids = ARRAY['a','a'] WHERE id = 'm21-p1'",
            "UPDATE exam_papers SET \"end\" = '08:00' WHERE id = 'm21-p1'",
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
                    "has_table_privilege('nexus_app', oid, 'DELETE'), has_table_privilege('nexus_app', oid, 'UPDATE') "
                    "FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            seats = name == "seat_assignments"
            assert tuple(flags) == (True, True, seats, seats, False)
