"""M20 gradebook on the real backend (NEX-189): lists, roster, family scope and remark masking, mark upsert and
replay, the mock's error order, encrypted remarks with sensitive-read audit, forced RLS and narrow grants."""

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
from nexus.modules.m20.models import Assessment, GradingScheme, MarkEntry, Rubric
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13 import test_learner_records as m13
from tests.fake_keycloak import FakeKeycloak

m13_vault = m13.m13_vault
guardian = m13.guardian
API = "/api/v1/"
YEAR = "cal-ls-2026"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
MODELS = (GradingScheme, Rubric, Assessment, MarkEntry)
LEARNERS = {"m20-a": ("rp-ls-rohan-learner", "10"), "m20-b": ("rp-ls-anaya-learner", "2")}
REMARK = "Test remark value"
CRITERIA = [
    {
        "code": "C1",
        "label": "Clarity",
        "levels": [{"score": 1, "descriptor": "Low"}, {"score": 2, "descriptor": "High"}],
    }
]
BANDS = [
    {"code": "B", "label": "Below", "minPercent": 0, "maxPercent": 50, "gradePoint": None},
    {"code": "A", "label": "Above", "minPercent": 50, "maxPercent": 100, "gradePoint": 9.5},
]
MARK: dict[str, Any] = {"marks": 42.5, "absent": False, "rubricScores": None, "remark": "Test new remark"}


def csrf(client: TestClient, key: str | None = None) -> dict[str, str]:
    headers = {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}
    return {**headers, "Idempotency-Key": key} if key else headers


@pytest.fixture
def gradebook(test_db: DbUrls, m13_vault: Vault) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    remark = asyncio.run(
        FieldCipher(m13_vault).encrypt(key_name("ten-ls", "tenant_data"), "mark_entries.remark", REMARK)
    )
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
                "VALUES ('m20-pr', 'ten-ls', 'ins-ls', 'M20', 'Program', 'course', true)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, kind, code, "
                "name) VALUES ('m20-cg', 'ten-ls', 'ins-ls', :y, 'm20-pr', 'group', 'M20', 'Group')"
            ),
            {"y": YEAR},
        )
        for learner, (_, roll) in LEARNERS.items():
            conn.execute(
                text(
                    "INSERT INTO enrolments (id, tenant_id, learner_id, academic_year_id, program_id, class_group_id, "
                    "roll_number, status, effective_from) VALUES (:id, 'ten-ls', :l, :y, 'm20-pr', 'm20-cg', :r, "
                    "'active', '2026-01-01')"
                ),
                {"id": f"{learner}-en", "l": learner, "y": YEAR, "r": roll},
            )
        conn.execute(
            text(
                "INSERT INTO subjects (id, tenant_id, institution_id, code, name, kind, active) "
                "VALUES ('m20-sub', 'ten-ls', 'ins-ls', 'M20S', 'Subject', 'core', true)"
            )
        )
        conn.execute(
            text(
                "INSERT INTO subject_offerings (id, tenant_id, academic_year_id, class_group_id, subject_id, "
                "staff_profile_ids) VALUES ('m20-off', 'ten-ls', :y, 'm20-cg', 'm20-sub', '{}')"
            ),
            {"y": YEAR},
        )
        conn.execute(
            text(
                "INSERT INTO grading_schemes (id, tenant_id, institution_id, name, kind, bands) "
                "VALUES ('m20-gs', 'ten-ls', 'ins-ls', 'Scheme', 'letter', CAST(:b AS jsonb))"
            ),
            {"b": json.dumps(BANDS)},
        )
        conn.execute(
            text(
                "INSERT INTO rubrics (id, tenant_id, name, criteria) "
                "VALUES ('m20-rub', 'ten-ls', 'Rubric', CAST(:c AS jsonb))"
            ),
            {"c": json.dumps(CRITERIA)},
        )
        for assessment, status, rubric in (
            ("m20-open", "open", None),
            ("m20-rubric", "marking", "m20-rub"),
            ("m20-pub", "published", None),
            ("m20-draft", "draft", None),
        ):
            conn.execute(
                text(
                    "INSERT INTO assessments (id, tenant_id, subject_offering_id, name, kind, max_marks, "
                    "weight_percent, rubric_id, status) VALUES (:id, 'ten-ls', 'm20-off', 'Test', 'test', 50, 12.5, "
                    ":r, :s)"
                ),
                {"id": assessment, "s": status, "r": rubric},
            )
        for entry, learner, note in (("m20-e1", "m20-a", remark), ("m20-e2", "m20-b", None)):
            conn.execute(
                text(
                    "INSERT INTO mark_entries (id, tenant_id, assessment_id, learner_id, marks, absent, remark, "
                    "entered_by_staff_profile_id) VALUES (:id, 'ten-ls', 'm20-pub', :l, 30, false, :r, "
                    "'rp-ls-arjun-staff')"
                ),
                {"id": entry, "l": learner, "r": note},
            )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM mark_entries WHERE assessment_id LIKE 'm20-%'"))
            for table, ids in (
                ("assessments", ["m20-open", "m20-rubric", "m20-pub", "m20-draft"]),
                ("rubrics", ["m20-rub"]),
                ("grading_schemes", ["m20-gs"]),
                ("subject_offerings", ["m20-off"]),
                ("subjects", ["m20-sub"]),
                ("enrolments", [f"{learner}-en" for learner in LEARNERS]),
                ("class_groups", ["m20-cg"]),
                ("programs", ["m20-pr"]),
                ("learners", list(LEARNERS)),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
        engine.dispose()


def mine(res: Any) -> list[dict[str, Any]]:
    assert res.status_code == 200, res.text
    return [row for row in res.json()["items"] if str(row.get("id", "m20-")).startswith("m20-")]


def test_lists_and_roster(client: TestClient, kc: FakeKeycloak, gradebook: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    scheme = mine(client.get(API + "grading-schemes"))[0]
    assert scheme["bands"] == BANDS
    assert mine(client.get(API + "rubrics"))[0]["criteria"] == CRITERIA
    rows = mine(client.get(API + "assessments", params={"classGroupId": "m20-cg"}))
    assert [a["id"] for a in rows] == ["m20-open", "m20-rubric", "m20-pub", "m20-draft"]
    assert (rows[0]["maxMarks"], rows[0]["weightPercent"]) == (50, 12.5)
    assert client.get(API + "assessments", params={"classGroupId": "nope"}).status_code == 404
    roster = client.get(API + "assessments/m20-open/roster").json()["items"]
    assert roster == [{"learnerId": "m20-b", "rollNumber": "2"}, {"learnerId": "m20-a", "rollNumber": "10"}]
    assert client.get(API + "assessments/nope/roster").status_code == 404


def test_marks_scope_and_masking(client: TestClient, kc: FakeKeycloak, gradebook: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    entries = client.get(API + "assessments/m20-pub/marks").json()["items"]
    assert [(e["id"], e["remark"], e["marks"]) for e in entries] == [("m20-e1", REMARK, 30), ("m20-e2", None, 30)]
    with gradebook.connect() as conn:
        reads = conn.scalar(
            text(
                "SELECT count(*) FROM audit_events "
                "WHERE action = 'm20.markEntry.sensitiveRead' AND target_id = 'm20-pub'"
            )
        )
    assert reads == 1
    guardian(client, kc, gradebook)
    entries = client.get(API + "assessments/m20-pub/marks").json()["items"]
    assert [(e["id"], e["remark"]) for e in entries] == [("m20-e1", None)]
    assert client.get(API + "assessments/m20-open/marks").status_code == 404  # not published
    assert client.get(API + "assessments").status_code == 403


def test_upsert_and_replay(client: TestClient, kc: FakeKeycloak, gradebook: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    url = API + "assessments/m20-open/marks/m20-a"
    first = client.put(url, json=MARK, headers=csrf(client, "m20-key-1"))
    assert first.status_code == 200, first.text
    entry = first.json()
    assert (entry["marks"], entry["remark"], entry["enteredByStaffProfileId"], entry["deviceId"]) == (
        42.5,
        MARK["remark"],
        "rp-ls-arjun-staff",
        None,
    )
    assert client.put(url, json=MARK, headers=csrf(client, "m20-key-1")).json() == entry
    second = client.put(url, json={**MARK, "marks": None, "absent": True, "remark": None}, headers=csrf(client))
    assert second.status_code == 200 and second.json()["id"] == entry["id"] and second.json()["absent"] is True
    with gradebook.connect() as conn:
        row = conn.execute(text("SELECT remark, marks FROM mark_entries WHERE id = :id"), {"id": entry["id"]}).one()
        saved = conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'm20.markEntry.saved' AND target_id = :id"),
            {"id": entry["id"]},
        )
    assert row.remark is None and row.marks is None and saved == 2
    rubric = client.put(
        API + "assessments/m20-rubric/marks/m20-b", json={**MARK, "rubricScores": {"C1": 2}}, headers=csrf(client)
    )
    assert rubric.status_code == 200 and rubric.json()["rubricScores"] == {"C1": 2}
    with gradebook.connect() as conn:
        stored = conn.scalar(text("SELECT remark FROM mark_entries WHERE id = :id"), {"id": rubric.json()["id"]})
    assert stored.startswith("v1:") and MARK["remark"] not in stored


def test_mark_errors_and_guard_order(client: TestClient, kc: FakeKeycloak, gradebook: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    closed = client.put(API + "assessments/m20-draft/marks/m20-a", json=MARK, headers=csrf(client))
    assert closed.status_code == 409 and closed.json()["error"]["details"][0]["path"] == "status"
    assert client.put(API + "assessments/nope/marks/m20-a", json=MARK, headers=csrf(client)).status_code == 404
    url = API + "assessments/m20-open/marks/m20-a"
    rubric_url = API + "assessments/m20-rubric/marks/m20-a"
    cases: list[tuple[str, dict[str, Any], str, str]] = [
        (url, {"marks": 1.3}, "marks", "Invalid mark entry"),
        (url, {"marks": "5"}, "marks", "Invalid mark entry"),
        (url, {"absent": True}, "marks", "Invalid mark entry"),
        (url, {"extra": 1}, "", "Invalid mark entry"),
        (url, {"marks": 50.5}, "marks", "Marks exceed the assessment maximum"),
        (url, {"rubricScores": {"C1": 1}}, "rubricScores", "Assessment has no rubric"),
        (
            rubric_url,
            {"marks": None, "absent": True, "rubricScores": {"C1": 1}},
            "rubricScores",
            "Absent learner cannot have rubric scores",
        ),
        (rubric_url, {"rubricScores": {"C1": 3}}, "rubricScores", "Invalid rubric scores"),
        (rubric_url, {"rubricScores": {"C1": 1, "C2": 1}}, "rubricScores", "Invalid rubric scores"),
        (API + "assessments/m20-open/marks/m20-nope", {}, "learnerId", "Outside the assessment roster"),
    ]
    for target, change, path, message in cases:
        res = client.put(target, json={**MARK, **change}, headers=csrf(client))
        assert res.status_code == 400, (change, res.text)
        assert {"path": path, "message": message} in res.json()["error"]["details"], change
    guardian(client, kc, gradebook)  # no m20.marks.enter
    assert client.put(url, content="{", headers=csrf(client)).status_code == 403
    sign_in(client, kc, **TEACHER)
    profile = text("UPDATE role_profiles SET status = :s WHERE id = 'rp-ls-arjun-staff'")
    with gradebook.begin() as conn:
        conn.execute(profile, {"s": "inactive"})
    try:
        assert client.put(API + "assessments/nope/marks/x", content="{", headers=csrf(client)).status_code == 403
    finally:
        with gradebook.begin() as conn:
            conn.execute(profile, {"s": "active"})


def test_storage_rls_grants_and_models(test_db: DbUrls, gradebook: Engine) -> None:
    assert ENCRYPTED_COLUMNS[("mark_entries", "remark")].field == "mark_entries.remark"
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            assert conn.scalar(text("SELECT count(*) FROM assessments WHERE id LIKE 'm20-%'")) == 0
        for statement in (
            "UPDATE mark_entries SET assessment_id = 'm20-open'",
            "UPDATE assessments SET status = 'open'",
            "DELETE FROM mark_entries",
        ):
            with pytest.raises(DBAPIError), app.begin() as conn:
                conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
                conn.execute(text(statement))
    finally:
        app.dispose()
    with gradebook.connect() as conn:
        for bad in ("remark = 'plain'", "marks = 1.3", "absent = true", "rubric_scores = '[1]'"):
            with pytest.raises(DBAPIError), conn.begin():
                conn.execute(text(f"UPDATE mark_entries SET {bad} WHERE id = 'm20-e1'"))  # noqa: S608
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
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'INSERT') "
                    "FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            assert tuple(flags) == (True, True, name == "mark_entries")
