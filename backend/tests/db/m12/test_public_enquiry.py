"""M12 public enquiry form on the real backend (NEX-204, D79, D81): mock parity, identical 404s, abuse limits in
Valkey, no IP or input in keys and audit, forced RLS on `enquiry_forms` and the id-only definer function."""

import re
import secrets
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from redis import Redis as SyncRedis
from redis.asyncio import Redis
from sqlalchemy import Engine, UniqueConstraint, create_engine, inspect, text
from sqlalchemy.engine import make_url

from nexus.core.models import Base
from nexus.modules.m12 import public, ratelimit
from nexus.modules.m12.models import EnquiryForm
from nexus.modules.m12.ratelimit import ValkeyLimiter, Window
from nexus.settings import get_settings
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls, downgrade, migrate
from tests.fake_keycloak import FakeKeycloak

API = "/api/v1/"
FORM_LS, FORM_RV = "pef-nex204lsform01", "pef-nex204rvform01"
TEACHER = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}  # no m12.admissions.manage
EMAIL = "nex-204-fixture@example.test"
INPUT: dict[str, Any] = {
    "learnerName": "Test learner",
    "contactName": "Test contact",
    "contactPhone": None,
    "contactEmail": EMAIL,
    "programId": None,
    "campusId": None,
    "consent": True,
    "website": "",
}
WIDE = (Window("ip", 1000, 600), Window("form", 1000, 3600))


def enquiries(form: str = FORM_LS) -> str:
    return f"{API}public/enquiry-forms/{form}/enquiries"


def stored(engine: Engine) -> list[Any]:
    with engine.connect() as conn:
        return list(conn.execute(text("SELECT * FROM enquiries WHERE contact_email = :e"), {"e": EMAIL}))


@pytest.fixture
def valkey() -> Iterator[tuple[str, SyncRedis]]:
    namespace = f"m12:test:{secrets.token_hex(6)}"
    sync = SyncRedis.from_url(get_settings().redis_url.get_secret_value())
    try:
        yield namespace, sync
    finally:
        keys = list(sync.scan_iter(f"{namespace}:*"))
        if keys:
            sync.delete(*keys)
        sync.close()


@pytest.fixture
def forms(
    test_db: DbUrls, client: TestClient, valkey: tuple[str, SyncRedis], monkeypatch: pytest.MonkeyPatch
) -> Iterator[Engine]:
    app: FastAPI = client.app  # type: ignore[assignment]
    app.state.public_limiter = ValkeyLimiter(Redis.from_url(get_settings().redis_url.get_secret_value()), valkey[0])
    monkeypatch.setattr(public, "POST_LIMITS", WIDE)
    monkeypatch.setattr(public, "GET_LIMITS", (Window("ip:get", 1000, 600),))
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        conn.execute(text("DELETE FROM enquiry_forms WHERE institution_id IN ('ins-ls', 'ins-rv')"))
        conn.execute(
            text(
                "INSERT INTO enquiry_forms (id, tenant_id, institution_id) VALUES "
                "(:ls, 'ten-ls', 'ins-ls'), (:rv, 'ten-rv', 'ins-rv')"
            ),
            {"ls": FORM_LS, "rv": FORM_RV},
        )
        conn.execute(
            text(
                "INSERT INTO programs (id, tenant_id, institution_id, code, name, kind, active) VALUES "
                "('m12p-active', 'ten-ls', 'ins-ls', 'M12PA', 'Public program', 'course', true), "
                "('m12p-closed', 'ten-ls', 'ins-ls', 'M12PC', 'Closed program', 'course', false), "
                "('m12p-foreign', 'ten-rv', 'ins-rv', 'M12PF', 'Foreign program', 'course', true)"
            )
        )
    try:
        yield engine
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM enquiries WHERE contact_email = :e"), {"e": EMAIL})
            conn.execute(text("DELETE FROM programs WHERE id LIKE 'm12p-%'"))
            conn.execute(text("DELETE FROM enquiry_forms WHERE id IN (:ls, :rv)"), {"ls": FORM_LS, "rv": FORM_RV})
        engine.dispose()


def test_form_metadata_and_stored_enquiry(client: TestClient, forms: Engine) -> None:
    form = client.get(f"{API}public/enquiry-forms/{FORM_LS}")
    assert form.status_code == 200, form.text
    body = form.json()
    assert set(body) == {
        "id",
        "institutionName",
        "institutionType",
        "defaultLocale",
        "supportedLocales",
        "programs",
        "campuses",
    }
    assert body["id"] == FORM_LS and body["defaultLocale"] in body["supportedLocales"]
    names = {p["id"] for p in body["programs"]}
    assert "m12p-active" in names and not names & {"m12p-closed", "m12p-foreign"}
    assert all(set(option) == {"id", "name"} for option in body["programs"] + body["campuses"])
    assert "tenantId" not in form.text and "ten-ls" not in form.text

    campus = body["campuses"][0]["id"] if body["campuses"] else None
    sent = client.post(enquiries(), json={**INPUT, "programId": "m12p-active", "campusId": campus})
    assert sent.status_code == 202 and sent.json() == {"received": True}
    (row,) = stored(forms)
    assert (row.tenant_id, row.institution_id, row.source, row.status) == ("ten-ls", "ins-ls", "public_form", "new")
    assert row.assigned_staff_profile_id is None and row.program_id == "m12p-active" and row.id.startswith("enq-")
    with forms.connect() as conn:
        event = conn.execute(
            text("SELECT actor_kind, actor_id, changes::text AS changes FROM audit_events WHERE target_id = :id"),
            {"id": row.id},
        ).one()
    assert event.actor_kind == "system" and event.actor_id is None
    assert EMAIL not in event.changes and "Test learner" not in event.changes and "testclient" not in event.changes
    assert '"field": "contactEmail"' in event.changes and "website" not in event.changes


def test_honeypot_and_invalid_bodies(client: TestClient, forms: Engine) -> None:
    bot = client.post(enquiries(), json={**INPUT, "website": "https://spam.example"})
    assert bot.status_code == 202 and bot.json() == {"received": True} and stored(forms) == []
    cases: list[tuple[dict[str, Any], str]] = [
        ({"contactEmail": None}, "contactPhone"),
        ({"consent": False}, "consent"),
        ({"consent": 1}, "consent"),
        ({"contactPhone": "+919876543210\n"}, "contactPhone"),
        ({"extra": "value"}, ""),
        ({"programId": "m12p-foreign"}, "programId"),
        ({"programId": "m12p-closed"}, "programId"),
        ({"campusId": "cmp-rv-north"}, "campusId"),
    ]
    for change, path in cases:
        res = client.post(enquiries(), json={**INPUT, **change})
        assert res.status_code == 400, (change, res.text)
        assert path in {d["path"] for d in res.json()["error"]["details"]}, change
        assert "value" not in res.text and "+919876543210" not in res.text
    bad = client.post(enquiries(), content="{", headers={"content-type": "application/json"})
    assert bad.status_code == 400 and bad.json()["error"]["details"] == [{"path": "", "message": "Invalid JSON body"}]
    assert stored(forms) == []


def _not_found(res: Any) -> dict[str, Any]:
    assert res.status_code == 404, res.text
    error = dict(res.json()["error"])
    error.pop("requestId", None)
    return error


def test_unknown_disabled_and_suspended_look_the_same(client: TestClient, forms: Engine) -> None:
    unknown = _not_found(client.get(f"{API}public/enquiry-forms/pef-doesnotexist00"))
    assert _not_found(client.post(enquiries("pef-doesnotexist00"), json=INPUT)) == unknown
    assert _not_found(client.get(f"{API}public/enquiry-forms/{'x' * 300}")) == unknown
    switch = text("UPDATE entitlements SET source = :s, enabled = :e WHERE tenant_id = 'ten-ls' AND module_id = 'M12'")
    with forms.begin() as conn:
        conn.execute(switch, {"s": "plan", "e": False})
    try:
        assert _not_found(client.get(f"{API}public/enquiry-forms/{FORM_LS}")) == unknown
        assert _not_found(client.post(enquiries(), json=INPUT)) == unknown
    finally:
        with forms.begin() as conn:
            conn.execute(switch, {"s": "core", "e": True})
    status = text("UPDATE institutions SET status = :s WHERE id = 'ins-ls'")
    with forms.begin() as conn:
        before = conn.scalar(text("SELECT status FROM institutions WHERE id = 'ins-ls'"))
        conn.execute(status, {"s": "suspended"})
    try:
        assert _not_found(client.get(f"{API}public/enquiry-forms/{FORM_LS}")) == unknown
    finally:
        with forms.begin() as conn:
            conn.execute(status, {"s": before})
    assert stored(forms) == []


def test_ip_and_form_limits(
    client: TestClient, forms: Engine, valkey: tuple[str, SyncRedis], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(public, "POST_LIMITS", ratelimit.POST_LIMITS)  # the real D81 limits: 5 per IP
    for _ in range(5):  # unknown ids count too, before any lookup
        assert client.post(enquiries("pef-doesnotexist00"), json=INPUT).status_code == 404
    limited = client.post(enquiries(), json=INPUT)
    assert limited.status_code == 429 and limited.json()["error"]["code"] == "rate_limited"
    assert limited.json()["error"]["details"] == [{"path": "", "message": "Too many requests"}]
    assert 0 < int(limited.headers["Retry-After"]) <= 600
    assert stored(forms) == []

    namespace, sync = valkey
    keys = [key.decode() for key in sync.scan_iter(f"{namespace}:*")]
    assert keys and all(re.fullmatch(rf"{namespace}:(ip|ip:get|form):[0-9a-f]{{64}}", key) for key in keys)
    assert not any("testclient" in key or "pef-" in key for key in keys)

    for key in keys:
        sync.delete(key)
    monkeypatch.setattr(public, "POST_LIMITS", (Window("ip", 1000, 600), Window("form", 2, 3600)))
    assert client.post(enquiries(), json={**INPUT, "website": "bot"}).status_code == 202  # honeypot counts
    assert client.post(enquiries(), json=INPUT).status_code == 202
    assert client.post(enquiries(), json=INPUT).status_code == 429
    # Another form id has its own window (not 429); ten-rv is served by another region's cell, so it is a 404.
    assert client.post(enquiries(FORM_RV), json=INPUT).status_code == 404
    monkeypatch.setattr(public, "GET_LIMITS", (Window("ip:get", 2, 600),))
    assert [client.get(f"{API}public/enquiry-forms/{FORM_LS}").status_code for _ in range(3)] == [200, 200, 429]
    with forms.connect() as conn:
        assert conn.scalar(text("SELECT count(*) FROM audit_events WHERE changes::text LIKE '%testclient%'")) == 0


def test_limiter_unavailable_fails_closed(client: TestClient, forms: Engine) -> None:
    app: FastAPI = client.app  # type: ignore[assignment]
    del app.state.public_limiter  # the process client points at a closed port in tests
    for res in (client.get(f"{API}public/enquiry-forms/{FORM_LS}"), client.post(enquiries(), json=INPUT)):
        assert res.status_code == 429 and res.headers["Retry-After"] == "600"
    assert stored(forms) == []


def test_staff_list_is_tenant_scoped_and_guarded(client: TestClient, kc: FakeKeycloak, forms: Engine) -> None:
    sign_in(client, kc)
    page = client.get(API + "enquiry-forms", params={"pageSize": 100}).json()
    assert {"id": FORM_LS, "tenantId": "ten-ls", "institutionId": "ins-ls"}.items() <= next(
        item for item in page["items"] if item["id"] == FORM_LS
    ).items()
    assert all(item["tenantId"] == "ten-ls" for item in page["items"]) and FORM_RV not in str(page)
    assert set(page["items"][0]) == {"id", "tenantId", "institutionId", "institutionName"}
    sign_in(client, kc, **TEACHER)
    denied = client.get(API + "enquiry-forms")
    assert denied.status_code == 403 and denied.json()["error"]["code"] == "forbidden"


def test_forced_rls_function_and_model(test_db: DbUrls, forms: Engine) -> None:
    app = create_engine(test_db.app_url)
    try:
        with app.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-rv', true)"))
            visible = set(conn.scalars(text("SELECT id FROM enquiry_forms")))
            assert FORM_RV in visible and FORM_LS not in visible
            row = conn.execute(text("SELECT * FROM nexus_public_enquiry_form(:id)"), {"id": FORM_LS}).one()
            assert dict(row._mapping) == {"tenant_id": "ten-ls", "institution_id": "ins-ls"}
        with app.begin() as conn:
            assert conn.scalar(text("SELECT count(*) FROM enquiry_forms")) == 0  # no tenant set: nothing
    finally:
        app.dispose()
    with forms.connect() as conn:
        flags = conn.execute(
            text(
                "SELECT relrowsecurity, relforcerowsecurity, has_table_privilege('nexus_app', oid, 'SELECT'), "
                "has_table_privilege('nexus_app', oid, 'INSERT'), has_table_privilege('nexus_app', oid, 'UPDATE') "
                "FROM pg_class WHERE oid = to_regclass('enquiry_forms')"
            )
        ).one()
        assert tuple(flags) == (True, True, True, False, False)
        assert conn.scalar(text("SELECT policyname FROM pg_policies WHERE tablename = 'enquiry_forms'")) == (
            "tenant_isolation"
        )
        definer = conn.execute(
            text(
                "SELECT prosecdef, has_function_privilege('public', p.oid, 'EXECUTE') AS anyone, "
                "has_function_privilege('nexus_app', p.oid, 'EXECUTE') AS app FROM pg_proc p "
                "WHERE proname = 'nexus_public_enquiry_form'"
            )
        ).one()
        assert (definer.prosecdef, definer.anyone, definer.app) == (True, False, True)
        inspector = inspect(conn)
        table = Base.metadata.tables[EnquiryForm.__tablename__]
        columns = {c["name"]: c["nullable"] for c in inspector.get_columns("enquiry_forms")}
        assert columns == {c.name: c.nullable for c in table.columns}
        assert {tuple(u["column_names"]) for u in inspector.get_unique_constraints("enquiry_forms")} == {
            tuple(c.name for c in u.columns) for u in table.constraints if isinstance(u, UniqueConstraint)
        }


def test_backfill_gives_every_institution_one_unique_form(test_db: DbUrls) -> None:
    password = make_url(test_db.app_url).password or ""
    downgrade(test_db.owner_url, password, "0028_admissions")
    migrate(test_db.owner_url, password)
    engine = create_engine(test_db.owner_url)
    try:
        with engine.begin() as conn:
            institutions = conn.scalar(text("SELECT count(*) FROM institutions"))
            rows = conn.execute(text("SELECT id, institution_id FROM enquiry_forms")).all()
            assert institutions and len(rows) == institutions
            assert len({row.id for row in rows}) == len(rows) == len({row.institution_id for row in rows})
            assert all(re.fullmatch(r"pef-[0-9A-Z]{26}", row.id) for row in rows)
            forced = conn.scalar(text("SELECT relforcerowsecurity FROM pg_class WHERE relname = 'institutions'"))
            assert forced is True  # the backfill restores FORCE on institutions
            conn.execute(text("DELETE FROM enquiry_forms"))  # leave the session database as the seed made it
    finally:
        engine.dispose()
