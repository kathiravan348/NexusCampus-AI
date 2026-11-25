"""M86 rollover on the real backend (NEX-193, D84): dry run rules, override and recount, confirm moves enrolments and
learner statuses, roll back restores them exactly, the window, one open run, guard order, RLS and narrow grants."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.modules.m86.models import PromotionDecision, RolloverRun
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

API = "/api/v1/"
FROM, TO = "cal-ls-2026", "m86-next"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
INPUT: dict[str, Any] = {
    "institutionId": "ins-ls",
    "fromAcademicYearId": FROM,
    "toAcademicYearId": TO,
    "carryForwardFees": True,
}
# learner, profile, from-year class group
LEARNERS = [
    ("m86-a", "rp-ls-rohan-learner", "m86-g1"),  # level 1 → promote to the first level 2 group (code A)
    ("m86-b", "rp-ls-anaya-learner", "m86-g3"),  # last level → graduate
    ("m86-c", "rp-ls-kavya-learner", "m86-g0"),  # no year level → skip
    ("m86-d", "rp-ls-ishaan-learner", "m86-g2"),  # level 2, no level 3 group next year → skip
]


def csrf(client: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}


def _run(conn: Any, sql: str, **params: Any) -> None:
    conn.execute(text(sql), params)


@pytest.fixture
def rollover(test_db: DbUrls) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        _run(
            conn,
            "INSERT INTO academic_calendars SELECT (jsonb_populate_record(NULL::academic_calendars, to_jsonb(c) || "
            "jsonb_build_object('id', CAST(:to AS text), 'academic_year', '2027-28', 'starts_on', '2027-06-01', "
            "'ends_on', "
            "'2028-03-31', 'periods', '[]'::jsonb, 'holidays', '[]'::jsonb))).* FROM academic_calendars c "
            "WHERE c.id = :from",
            to=TO,
            **{"from": FROM},
        )
        _run(
            conn,
            "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) "
            "VALUES ('m86-pr', 'ten-ls', 'ins-ls', 'M86', 'Program', 'course', true)",
        )
        for level, order in (("m86-l1", 1), ("m86-l2", 2), ("m86-l3", 3)):
            _run(
                conn,
                'INSERT INTO year_levels (id, tenant_id, program_id, code, name, "order") '
                "VALUES (:id, 'ten-ls', 'm86-pr', :id, 'Level', :o)",
                id=level,
                o=order,
            )
        groups = [
            ("m86-g0", FROM, None, "G0"),
            ("m86-g1", FROM, "m86-l1", "G1"),
            ("m86-g2", FROM, "m86-l2", "G2"),
            ("m86-g3", FROM, "m86-l3", "G3"),
            ("m86-t2b", TO, "m86-l2", "B"),
            ("m86-t2a", TO, "m86-l2", "A"),
        ]
        for group, year, group_level, code in groups:
            _run(
                conn,
                "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, year_level_id, "
                "kind, code, name) VALUES (:id, 'ten-ls', 'ins-ls', :y, 'm86-pr', :l, 'section', :c, 'Group')",
                id=group,
                y=year,
                l=group_level,
                c=code,
            )
        for learner, profile, group in LEARNERS:
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
                "INSERT INTO enrolments (id, tenant_id, learner_id, academic_year_id, program_id, year_level_id, "
                "class_group_id, roll_number, status, effective_from) SELECT :id, 'ten-ls', :l, :y, 'm86-pr', "
                "year_level_id, id, '1', 'active', '2026-06-01' FROM class_groups WHERE id = :g",
                id=f"{learner}-en",
                l=learner,
                y=FROM,
                g=group,
            )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM promotion_decisions WHERE learner_id LIKE 'm86-%'"))
            conn.execute(text("DELETE FROM rollover_runs WHERE to_academic_year_id = :to"), {"to": TO})
            conn.execute(text("DELETE FROM enrolments WHERE learner_id LIKE 'm86-%'"))
            for table in ("learners", "class_groups", "year_levels", "programs", "academic_calendars"):
                conn.execute(text(f"DELETE FROM {table} WHERE id LIKE 'm86-%'"))  # noqa: S608
        engine.dispose()


def decisions(client: TestClient, run_id: str) -> dict[str, dict[str, Any]]:
    items = client.get(API + f"rollover-runs/{run_id}/decisions", params={"pageSize": 100}).json()["items"]
    return {row["learnerId"]: row for row in items}


def enrolments(engine: Engine) -> list[tuple[Any, ...]]:
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT learner_id, class_group_id, status, effective_from::text, effective_to::text FROM enrolments "
                "WHERE learner_id LIKE 'm86-%' ORDER BY learner_id, effective_from"
            )
        )
        return [tuple(row) for row in rows]


def learner_status(engine: Engine) -> dict[str, tuple[str, Any]]:
    with engine.connect() as conn:
        rows = conn.execute(text("SELECT id, status, left_on::text FROM learners WHERE id LIKE 'm86-%'"))
        return {row.id: (row.status, row.left_on) for row in rows}


def test_dry_run_override_confirm_and_roll_back(client: TestClient, kc: FakeKeycloak, rollover: Engine) -> None:
    sign_in(client, kc)
    created = client.post(API + "rollover-runs", json=INPUT, headers=csrf(client))
    assert created.status_code == 201, created.text
    run = created.json()
    assert run["status"] == "dry_run_ready" and run["createdByStaffProfileId"] == "rp-ls-priya-staff"
    assert run["counts"] == {"promote": 1, "detain": 0, "graduate": 1, "transfer": 0, "skip": 2}
    plan = decisions(client, run["id"])
    assert (plan["m86-a"]["action"], plan["m86-a"]["toClassGroupId"]) == ("promote", "m86-t2a")
    assert plan["m86-b"]["action"] == "graduate"
    assert plan["m86-c"]["reasonKey"] == "m86.promotion.noYearLevel"
    assert plan["m86-d"]["reasonKey"] == "m86.promotion.noTargetGroup"
    again = client.post(API + "rollover-runs", json=INPUT, headers=csrf(client))
    assert again.status_code == 409 and again.json()["error"]["details"][0]["path"] == "fromAcademicYearId"

    url = API + f"rollover-runs/{run['id']}/decisions/{plan['m86-c']['id']}"
    for body, path in (
        ({"action": "detain", "toClassGroupId": "m86-g1", "reasonKey": None}, "toClassGroupId"),
        ({"action": "promote", "toClassGroupId": None, "reasonKey": None}, "toClassGroupId"),
        ({"action": "skip", "toClassGroupId": None, "reasonKey": "Bad key"}, "reasonKey"),
    ):
        bad = client.put(url, json=body, headers=csrf(client))
        assert bad.status_code == 400 and bad.json()["error"]["details"][0]["path"] == path, body
    changed = client.put(
        url, json={"action": "detain", "toClassGroupId": "m86-t2b", "reasonKey": None}, headers=csrf(client)
    )
    assert changed.status_code == 200 and changed.json()["overriddenByStaffProfileId"] == "rp-ls-priya-staff"
    counts = client.get(API + "rollover-runs").json()["items"][-1]["counts"]
    assert (counts["detain"], counts["skip"]) == (1, 1)

    before = enrolments(rollover)
    confirmed = client.post(API + f"rollover-runs/{run['id']}/confirm", headers=csrf(client))
    assert confirmed.status_code == 200 and confirmed.json()["status"] == "completed"
    assert confirmed.json()["rollbackUntil"] is not None
    assert enrolments(rollover) == [
        ("m86-a", "m86-g1", "completed", "2026-06-01", "2027-05-31"),
        ("m86-a", "m86-t2a", "active", "2027-06-01", None),
        ("m86-b", "m86-g3", "completed", "2026-06-01", "2027-05-31"),
        ("m86-c", "m86-g0", "completed", "2026-06-01", "2027-05-31"),
        ("m86-c", "m86-t2b", "active", "2027-06-01", None),
        ("m86-d", "m86-g2", "active", "2026-06-01", None),
    ]
    assert learner_status(rollover)["m86-b"] == ("graduated", "2027-05-31")
    late = client.put(url, json={"action": "skip", "toClassGroupId": None, "reasonKey": None}, headers=csrf(client))
    assert late.status_code == 409 and late.json()["error"]["details"][0]["path"] == "status"

    undone = client.post(API + f"rollover-runs/{run['id']}/rollback", headers=csrf(client))
    assert undone.status_code == 200 and undone.json()["status"] == "rolled_back"
    assert enrolments(rollover) == before
    assert all(value == ("enrolled", None) for value in learner_status(rollover).values())
    twice = client.post(API + f"rollover-runs/{run['id']}/rollback", headers=csrf(client))
    assert twice.status_code == 409 and twice.json()["error"]["details"][0]["path"] == "rollbackUntil"
    with rollover.connect() as conn:
        actions = conn.scalars(
            text("SELECT action FROM audit_events WHERE target_id = :id ORDER BY seq"), {"id": run["id"]}
        ).all()
    assert actions == [
        "m86.rolloverRun.created",
        "m86.rolloverRun.decisionOverridden",
        "m86.rolloverRun.confirmed",
        "m86.rolloverRun.rolledBack",
    ]


def test_window_expiry_bad_input_and_guard_order(client: TestClient, kc: FakeKeycloak, rollover: Engine) -> None:
    sign_in(client, kc, **TEACHER)  # no m86.rollover.manage
    assert client.post(API + "rollover-runs", content="{", headers=csrf(client)).status_code == 403
    sign_in(client, kc)
    for change, path in (
        ({"toAcademicYearId": FROM}, "toAcademicYearId"),
        ({"institutionId": "ins-rv"}, "institutionId"),
        ({"toAcademicYearId": "cal-nope"}, "toAcademicYearId"),
        ({"carryForwardFees": "yes"}, "carryForwardFees"),
        ({"extra": 1}, ""),
    ):
        res = client.post(API + "rollover-runs", json={**INPUT, **change}, headers=csrf(client))
        assert res.status_code == 400 and res.json()["error"]["details"][0]["path"] == path, change
    assert client.post(API + "rollover-runs/nope/confirm", headers=csrf(client)).status_code == 404
    run = client.post(API + "rollover-runs", json=INPUT, headers=csrf(client)).json()
    assert client.post(API + f"rollover-runs/{run['id']}/confirm", headers=csrf(client)).status_code == 200
    with rollover.begin() as conn:
        conn.execute(
            text("UPDATE rollover_runs SET rollback_until = now() - interval '1 minute' WHERE id = :id"),
            {"id": run["id"]},
        )
    closed = client.post(API + f"rollover-runs/{run['id']}/rollback", headers=csrf(client))
    assert closed.status_code == 409 and closed.json()["error"]["details"][0]["path"] == "rollbackUntil"


def test_rls_grants_and_models(test_db: DbUrls, rollover: Engine) -> None:
    app = create_engine(test_db.app_url)
    try:
        for statement in (
            "UPDATE enrolments SET class_group_id = 'm86-g2' WHERE id = 'm86-a-en'",
            "UPDATE learners SET learner_number = 'x' WHERE id = 'm86-a'",
            "UPDATE rollover_runs SET institution_id = 'x'",
            "DELETE FROM learners WHERE id = 'm86-a'",
        ):
            with pytest.raises(DBAPIError), app.begin() as conn:
                conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
                conn.execute(text(statement))
    finally:
        app.dispose()
    with rollover.connect() as conn:
        inspector = inspect(conn)
        for model in (RolloverRun, PromotionDecision):
            name = str(model.__tablename__)
            meta = Base.metadata.tables[name]
            assert {c["name"]: c["nullable"] for c in inspector.get_columns(name)} == {
                c.name: c.nullable for c in meta.columns
            }
            flags = conn.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'DELETE') "
                    "FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            assert tuple(flags) == (True, True, False)
