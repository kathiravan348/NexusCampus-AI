"""M25-M28 homes and KPIs on the real backend (NEX-192): role choice, counts inside the tenant's week, communication
cards and the M24 switch, KPI values and permission. Counts and aggregates only."""

import asyncio
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text

from nexus.core.fieldcrypto import FieldCipher
from nexus.core.vault import Vault, key_name
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13 import test_learner_records as m13
from tests.fake_keycloak import FakeKeycloak

m13_vault = m13.m13_vault
guardian = m13.guardian
API = "/api/v1/"
YEAR = "cal-ls-2026"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
PRIYA, SUNITA = "per-ls-priya", "per-ls-sunita"


def _run(conn: Any, sql: str, **params: Any) -> None:
    conn.execute(text(sql), params)


def seal(vault: Vault, field: str, value: str) -> str:
    return asyncio.run(FieldCipher(vault).encrypt(key_name("ten-ls", "tenant_data"), field, value))


@pytest.fixture
def homes(test_db: DbUrls, m13_vault: Vault) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    today = datetime.now(UTC).astimezone(ZoneInfo("Asia/Kolkata")).date()
    with engine.begin() as conn:
        for learner, profile in (("m28-a", "rp-ls-rohan-learner"), ("m28-b", "rp-ls-anaya-learner")):
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
            "VALUES ('m28-pr', 'ten-ls', 'ins-ls', 'M28', 'Program', 'course', true)",
        )
        _run(
            conn,
            "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, kind, code, name, "
            "homeroom_staff_profile_id) VALUES ('m28-cg', 'ten-ls', 'ins-ls', :y, 'm28-pr', 'group', 'M28', 'Group', "
            "'rp-ls-arjun-staff')",
            y=YEAR,
        )
        for learner in ("m28-a", "m28-b"):
            _run(
                conn,
                "INSERT INTO enrolments (id, tenant_id, learner_id, academic_year_id, program_id, class_group_id, "
                "status, effective_from) VALUES (:id, 'ten-ls', :l, :y, 'm28-pr', 'm28-cg', 'active', '2026-01-01')",
                id=f"{learner}-en",
                l=learner,
                y=YEAR,
            )
        for session, day in (("m28-today", today), ("m28-old", today - timedelta(days=14))):
            _run(
                conn,
                "INSERT INTO attendance_sessions (id, tenant_id, institution_id, mode, date, class_group_id, status) "
                "VALUES (:id, 'ten-ls', 'ins-ls', 'daily', :d, 'm28-cg', 'open')",
                id=session,
                d=day,
            )
            _run(
                conn,
                "INSERT INTO attendance_marks (id, tenant_id, session_id, learner_id, status, method) "
                "VALUES (:id, 'ten-ls', :s, 'm28-a', 'absent', 'manual')",
                id=f"{session}-mark",
                s=session,
            )
        _run(
            conn,
            'INSERT INTO leave_requests (id, tenant_id, learner_id, requested_by_person_id, "from", "to", reason, '
            "status) VALUES ('m28-leave', 'ten-ls', 'm28-a', :p, :d, :d, :r, 'pending')",
            p=SUNITA,
            d=today,
            r=seal(m13_vault, "leave_requests.reason", "Test reason"),
        )
        lines = '[{"feeHeadId": "h", "description": "Fee", "amount": %d, "discount": 0, "tax": 0}]'
        for invoice, total, paid, status in (("m28-i1", 100, 0, "issued"), ("m28-i2", 50, 50, "paid")):
            _run(
                conn,
                "INSERT INTO fee_invoices (id, tenant_id, learner_id, invoice_number, currency, issued_on, due_on, "
                "lines, total, paid, status) VALUES (:id, 'ten-ls', 'm28-a', :id, 'INR', '2026-05-01', '2026-06-01', "
                "CAST(:lines AS jsonb), :t, :p, :s)",
                id=invoice,
                lines=lines % total,
                t=total,
                p=paid,
                s=status,
            )
        _run(
            conn,
            "INSERT INTO message_threads (id, tenant_id, institution_id, kind, subject, participant_person_ids, "
            "archived) VALUES ('m28-thread', 'ten-ls', 'ins-ls', 'direct', 'Subject', :people, false)",
            people=[PRIYA, SUNITA],
        )
        _run(
            conn,
            "INSERT INTO thread_messages (id, tenant_id, thread_id, sender_person_id, body, attachment_ids, "
            "read_by_person_ids) VALUES ('m28-msg', 'ten-ls', 'm28-thread', :p, :b, '{}', :readers)",
            p=PRIYA,
            b=seal(m13_vault, "thread_messages.body", "Test body"),
            readers=[PRIYA],
        )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            for table, ids in (
                ("thread_messages", ["m28-msg"]),
                ("message_threads", ["m28-thread"]),
                ("fee_invoices", ["m28-i1", "m28-i2"]),
                ("leave_requests", ["m28-leave"]),
                ("attendance_marks", ["m28-today-mark", "m28-old-mark"]),
                ("attendance_sessions", ["m28-today", "m28-old"]),
                ("enrolments", ["m28-a-en", "m28-b-en"]),
                ("class_groups", ["m28-cg"]),
                ("programs", ["m28-pr"]),
                ("learners", ["m28-a", "m28-b"]),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
        engine.dispose()


def counts(home: dict[str, Any]) -> dict[str, int | None]:
    return {card["titleKey"]: card["count"] for card in home["cards"]}


def test_family_home(client: TestClient, kc: FakeKeycloak, homes: Engine) -> None:
    guardian(client, kc, homes)
    home = client.get(API + "me/home").json()
    assert home["role"] == "family" and home["personId"] == SUNITA and home["learnerIds"] == ["m28-a"]
    assert counts(home) == {
        "m28.card.absences": 1,  # this week's absence only, not the one two weeks ago
        "m28.card.fees": 1,
        "m28.card.messages": 1,
        "m28.card.notices": 0,
    }
    assert [card["href"] for card in home["cards"]] == ["/attendance", "/fees", "/messages", "/notices"]
    switch = text("UPDATE entitlements SET source = :s, enabled = :e WHERE tenant_id = 'ten-ls' AND module_id = 'M24'")
    with homes.begin() as conn:
        conn.execute(switch, {"s": "plan", "e": False})
    try:
        assert list(counts(client.get(API + "me/home").json())) == ["m28.card.absences", "m28.card.fees"]
    finally:
        with homes.begin() as conn:
            conn.execute(switch, {"s": "core", "e": True})


def test_staff_and_leader_homes(client: TestClient, kc: FakeKeycloak, homes: Engine) -> None:
    sign_in(client, kc, **TEACHER)
    home = client.get(API + "me/home").json()
    assert home["role"] == "staff" and home["learnerIds"] == []
    assert counts(home)["m28.card.attendance"] == 1 and counts(home)["m28.card.leave"] == 1
    assert client.get(API + "dashboards/kpis").status_code == 403
    sign_in(client, kc)
    leader = client.get(API + "me/home").json()
    alerts = counts(leader)["m28.card.alerts"]
    assert leader["role"] == "leader" and counts(leader)["m28.card.kpi"] == 5 and alerts is not None and alerts >= 1


def test_kpis(client: TestClient, kc: FakeKeycloak, homes: Engine) -> None:
    sign_in(client, kc)
    kpis = {kpi["code"]: kpi for kpi in client.get(API + "dashboards/kpis").json()}
    assert list(kpis) == ["attendance", "collected", "outstanding", "admissions", "learners"]
    assert (kpis["collected"]["value"], kpis["outstanding"]["value"]) == (50, 100)
    assert kpis["collected"]["currency"] == "INR" and kpis["attendance"]["currency"] is None
    assert kpis["attendance"]["unit"] == "percent" and kpis["attendance"]["value"] == 0  # both marks are absences
    assert kpis["learners"]["value"] >= 2 and all(kpi["labelKey"] == f"m28.kpi.{code}" for code, kpi in kpis.items())
