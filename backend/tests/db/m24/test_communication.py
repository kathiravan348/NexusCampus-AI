"""M24 communication on the real backend (NEX-191): thread visibility, replies and replay, notice audiences and time
windows, meeting slots and booking masking, encrypted bodies and notes, forced RLS and grants."""

import asyncio
import json
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.exc import DBAPIError

from nexus.agent.tenant_export import ENCRYPTED_COLUMNS
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.models import Base
from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from nexus.core.vault import Vault, key_name
from nexus.modules.m24.models import MeetingBooking, MeetingSlot, MessageThread, Notice, ThreadMessage
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m13 import test_learner_records as m13
from tests.fake_keycloak import FakeKeycloak

m13_vault = m13.m13_vault
guardian = m13.guardian
API = "/api/v1/"
YEAR = "cal-ls-2026"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
PRIYA, SUNITA, ARJUN = "per-ls-priya", "per-ls-sunita", "per-ls-arjun"
MODELS = (MessageThread, ThreadMessage, Notice, MeetingSlot, MeetingBooking)
BODY, NOTE = "Test message body", "Test booking note"
# id, kind, participants, class group, archived
THREADS = [
    ("m24-t1", "direct", [PRIYA, SUNITA], None, False),
    ("m24-t2", "broadcast", [PRIYA], None, False),
    ("m24-t3", "class_group", [PRIYA, ARJUN], "m24-cg", True),
]
# id, audience, status, publish offset (hours from now), expiry offset
NOTICES: list[tuple[str, dict[str, Any], str, int, int | None]] = [
    ("m24-n-all", {"kind": "everyone", "ids": []}, "published", -2, None),
    ("m24-n-cg", {"kind": "class_groups", "ids": ["m24-cg"]}, "published", -2, None),
    ("m24-n-role", {"kind": "roles", "ids": ["teacher"]}, "published", -2, None),
    ("m24-n-person", {"kind": "people", "ids": [SUNITA]}, "published", -2, 48),
    ("m24-n-draft", {"kind": "everyone", "ids": []}, "draft", -2, None),
    ("m24-n-future", {"kind": "everyone", "ids": []}, "published", 24, None),
    ("m24-n-expired", {"kind": "everyone", "ids": []}, "published", -48, -1),
]


def csrf(client: TestClient, key: str | None = None) -> dict[str, str]:
    headers = {CSRF_HEADER: client.cookies.get(CSRF_COOKIE) or ""}
    return {**headers, "Idempotency-Key": key} if key else headers


def seal(vault: Vault, field: str, value: str) -> str:
    return asyncio.run(FieldCipher(vault).encrypt(key_name("ten-ls", "tenant_data"), field, value))


def _run(conn: Any, sql: str, **params: Any) -> None:
    conn.execute(text(sql), params)


@pytest.fixture
def comms(test_db: DbUrls, m13_vault: Vault) -> Iterator[Engine]:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        _run(
            conn,
            "INSERT INTO learners (id, tenant_id, institution_id, campus_id, person_id, role_profile_id, "
            "learner_number, status, admission_date, retention_state, custom_fields) SELECT 'm24-a', tenant_id, "
            "institution_id, campus_id, person_id, id, 'M24A', 'enrolled', '2026-01-01', 'active', '{}' "
            "FROM role_profiles WHERE id = 'rp-ls-rohan-learner'",
        )
        _run(
            conn,
            "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) "
            "VALUES ('m24-pr', 'ten-ls', 'ins-ls', 'M24', 'Program', 'course', true)",
        )
        _run(
            conn,
            "INSERT INTO class_groups (id, tenant_id, institution_id, academic_year_id, program_id, kind, code, "
            "name) VALUES ('m24-cg', 'ten-ls', 'ins-ls', :y, 'm24-pr', 'group', 'M24', 'Group')",
            y=YEAR,
        )
        _run(
            conn,
            "INSERT INTO enrolments (id, tenant_id, learner_id, academic_year_id, program_id, class_group_id, status, "
            "effective_from) VALUES ('m24-en', 'ten-ls', 'm24-a', :y, 'm24-pr', 'm24-cg', 'active', '2026-01-01')",
            y=YEAR,
        )
        for thread, kind, people, group, archived in THREADS:
            _run(
                conn,
                "INSERT INTO message_threads (id, tenant_id, institution_id, kind, subject, participant_person_ids, "
                "class_group_id, archived) VALUES (:id, 'ten-ls', 'ins-ls', :k, 'Subject', :p, :g, :a)",
                id=thread,
                k=kind,
                p=people,
                g=group,
                a=archived,
            )
        _run(
            conn,
            "INSERT INTO thread_messages (id, tenant_id, thread_id, sender_person_id, body, attachment_ids, "
            "read_by_person_ids) VALUES ('m24-m1', 'ten-ls', 'm24-t1', :p, :b, '{}', :readers)",
            p=PRIYA,
            readers=[PRIYA],
            b=seal(m13_vault, "thread_messages.body", BODY),
        )
        for notice, audience, status, publish, expires in NOTICES:
            _run(
                conn,
                "INSERT INTO notices (id, tenant_id, institution_id, title, body, audience, channels, "
                "requires_acknowledgement, publish_at, expires_at, status, created_by_staff_profile_id, created_at, "
                "updated_at) VALUES (:id, 'ten-ls', 'ins-ls', 'Title', 'Body', CAST(:a AS jsonb), ARRAY['in_app'], "
                "false, now() + make_interval(hours => :p), CASE WHEN :has_expiry THEN now() + "
                "make_interval(hours => :e) END, :s, 'rp-ls-priya-staff', now() - interval '3 days', "
                "now() - interval '3 days')",
                id=notice,
                a=json.dumps(audience),
                p=publish,
                e=expires or 0,
                has_expiry=expires is not None,
                s=status,
            )
        for slot, staff in (("m24-s1", "rp-ls-arjun-staff"), ("m24-s2", "rp-ls-priya-staff")):
            _run(
                conn,
                'INSERT INTO meeting_slots (id, tenant_id, staff_profile_id, date, start, "end", mode, location, '
                "capacity) VALUES (:id, 'ten-ls', :s, '2026-07-01', '16:00', '16:15', 'in_person', 'Room 1', 2)",
                id=slot,
                s=staff,
            )
        for booking, slot, person, note in (
            ("m24-b1", "m24-s1", SUNITA, seal(m13_vault, "meeting_bookings.note", NOTE)),
            ("m24-b2", "m24-s2", "per-ls-deepak", None),
        ):
            _run(
                conn,
                "INSERT INTO meeting_bookings (id, tenant_id, slot_id, guardian_person_id, learner_id, status, note) "
                "VALUES (:id, 'ten-ls', :s, :p, 'm24-a', 'booked', :n)",
                id=booking,
                s=slot,
                p=person,
                n=note,
            )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM thread_messages WHERE thread_id LIKE 'm24-%'"))
            for table, ids in (
                ("meeting_bookings", ["m24-b1", "m24-b2"]),
                ("meeting_slots", ["m24-s1", "m24-s2"]),
                ("notices", [row[0] for row in NOTICES]),
                ("message_threads", [row[0] for row in THREADS]),
                ("enrolments", ["m24-en"]),
                ("class_groups", ["m24-cg"]),
                ("programs", ["m24-pr"]),
                ("learners", ["m24-a"]),
            ):
                conn.execute(text(f"DELETE FROM {table} WHERE id = ANY(:ids)"), {"ids": ids})  # noqa: S608
        engine.dispose()


def mine(res: Any) -> list[str]:
    assert res.status_code == 200, res.text
    return [row["id"] for row in res.json()["items"] if row["id"].startswith("m24-")]


def test_threads_and_messages(client: TestClient, kc: FakeKeycloak, comms: Engine) -> None:
    sign_in(client, kc)
    assert mine(client.get(API + "message-threads", params={"pageSize": 100})) == ["m24-t1", "m24-t2", "m24-t3"]
    guardian(client, kc, comms)
    assert mine(client.get(API + "message-threads")) == ["m24-t1"]
    messages = client.get(API + "message-threads/m24-t1/messages").json()["items"]
    assert [(m["id"], m["body"], m["senderPersonId"]) for m in messages] == [("m24-m1", BODY, PRIYA)]
    assert client.get(API + "message-threads/m24-t2/messages").status_code == 404
    with comms.connect() as conn:
        reads = conn.scalar(
            text(
                "SELECT count(*) FROM audit_events "
                "WHERE action = 'm24.threadMessage.sensitiveRead' AND target_id = 'm24-t1'"
            )
        )
    assert reads == 1


def test_reply_replay_and_errors(client: TestClient, kc: FakeKeycloak, comms: Engine) -> None:
    guardian(client, kc, comms)
    url = API + "message-threads/m24-t1/messages"
    first = client.post(url, json={"body": "  Test reply  "}, headers=csrf(client, "m24-key-1"))
    assert first.status_code == 201, first.text
    message = first.json()
    assert (message["body"], message["senderPersonId"], message["readByPersonIds"], message["deviceId"]) == (
        "Test reply",
        SUNITA,
        [SUNITA],
        None,
    )
    assert client.post(url, json={"body": "  Test reply  "}, headers=csrf(client, "m24-key-1")).json() == message
    with comms.connect() as conn:
        stored = conn.scalar(text("SELECT body FROM thread_messages WHERE id = :id"), {"id": message["id"]})
        last = conn.scalar(text("SELECT last_message_at FROM message_threads WHERE id = 'm24-t1'"))
        sent = conn.scalar(
            text("SELECT count(*) FROM audit_events WHERE action = 'm24.threadMessage.sent' AND target_id = 'm24-t1'")
        )
    assert stored.startswith("v1:") and "Test reply" not in stored and last is not None and sent == 1
    for body in ({"body": "   "}, {"body": "x" * 4001}, {"body": "ok", "extra": 1}, {}):
        bad = client.post(url, json=body, headers=csrf(client))
        assert bad.status_code == 400 and bad.json()["error"]["details"][0] == {
            "path": "body",
            "message": "Invalid message body",
        }
    assert (
        client.post(API + "message-threads/m24-t2/messages", json={"body": "x"}, headers=csrf(client)).status_code
        == 404
    )
    sign_in(client, kc)
    archived = client.post(API + "message-threads/m24-t3/messages", json={"body": "x"}, headers=csrf(client))
    assert archived.status_code == 409 and archived.json()["error"]["details"] == [
        {"path": "archived", "message": "Thread is archived"}
    ]


def test_notice_audiences(client: TestClient, kc: FakeKeycloak, comms: Engine) -> None:
    sign_in(client, kc)  # publisher: every notice
    assert mine(client.get(API + "notices", params={"pageSize": 100})) == [row[0] for row in NOTICES]
    guardian(client, kc, comms)
    assert mine(client.get(API + "notices", params={"pageSize": 100})) == ["m24-n-all", "m24-n-cg", "m24-n-person"]
    sign_in(client, kc, **TEACHER)
    assert mine(client.get(API + "notices", params={"pageSize": 100})) == ["m24-n-all", "m24-n-role"]


def test_meetings(client: TestClient, kc: FakeKeycloak, comms: Engine) -> None:
    sign_in(client, kc)
    assert mine(client.get(API + "meeting-slots")) == ["m24-s1", "m24-s2"]
    assert mine(client.get(API + "meeting-slots", params={"staffProfileId": "rp-ls-arjun-staff"})) == ["m24-s1"]
    assert client.get(API + "meeting-slots", params={"staffProfileId": "rp-ls-sunita-guardian"}).status_code == 404
    bookings = client.get(API + "meeting-bookings").json()["items"]
    assert [(b["id"], b["note"]) for b in bookings if b["id"].startswith("m24-")] == [
        ("m24-b1", NOTE),
        ("m24-b2", None),
    ]
    sign_in(client, kc, **TEACHER)  # staff of slot s1: sees the booking, never the note
    assert [(b["id"], b["note"]) for b in client.get(API + "meeting-bookings").json()["items"]] == [("m24-b1", None)]
    guardian(client, kc, comms)  # own booking with its note
    assert [(b["id"], b["note"]) for b in client.get(API + "meeting-bookings").json()["items"]] == [("m24-b1", NOTE)]


def test_storage_rls_grants_and_models(test_db: DbUrls, comms: Engine) -> None:
    for key in (("thread_messages", "body"), ("meeting_bookings", "note")):
        assert ENCRYPTED_COLUMNS[key].field == ".".join(key)
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            assert conn.scalar(text("SELECT count(*) FROM message_threads WHERE id LIKE 'm24-%'")) == 0
        for statement in (
            "UPDATE message_threads SET archived = false",
            "UPDATE thread_messages SET body = 'x'",
            "DELETE FROM thread_messages",
            "UPDATE notices SET status = 'published'",
        ):
            with pytest.raises(DBAPIError), app.begin() as conn:
                conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
                conn.execute(text(statement))
    finally:
        app.dispose()
    with comms.connect() as conn:
        for bad in (
            "UPDATE thread_messages SET body = 'plain' WHERE id = 'm24-m1'",
            "UPDATE meeting_bookings SET note = 'plain' WHERE id = 'm24-b2'",
            "UPDATE message_threads SET participant_person_ids = ARRAY['a'] WHERE id = 'm24-t1'",
            "UPDATE message_threads SET class_group_id = NULL WHERE id = 'm24-t3'",
            "UPDATE notices SET channels = ARRAY['fax'] WHERE id = 'm24-n-all'",
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
            flags = conn.execute(
                text(
                    "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'INSERT') "
                    "FROM pg_class WHERE oid = to_regclass(:n)"
                ),
                {"n": name},
            ).one()
            assert tuple(flags) == (True, True, name == "thread_messages")
