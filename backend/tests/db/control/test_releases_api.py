"""P07 releases, staged rollouts, and the install agent's online update check (NEX-115)."""

import logging
from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, ProgrammingError
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.control.releases import Release, select_update_offer
from nexus.control.seed import load_fixtures
from nexus.control.sessions import SESSION_COOKIE, DbSessionStore
from nexus.devtools.agent_token import issue_token, revoke_token

API = "/control/api/v1"
ADMIN, SUPPORT, SALES, PARTNER = "stf-0001", "stf-0042", "stf-0011", "stf-0051"
FIX = load_fixtures()


def by_key(rows: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    return {r[key]: r for r in rows}


async def get(api: httpx2.AsyncClient, staff: str, path: str, **params: Any) -> httpx2.Response:
    return await api.get(f"{API}{path}", params=params, headers={"X-Nexus-Staff": staff})


@pytest.mark.anyio
async def test_lists_filters_detail_and_permissions_match_fixtures(api: httpx2.AsyncClient) -> None:
    rels = (await get(api, ADMIN, "/releases", pageSize=200)).json()
    assert rels["total"] == len(FIX.releases)
    assert by_key(rels["items"], "id") == by_key(FIX.releases, "id")

    rols = (await get(api, SUPPORT, "/rollouts", pageSize=200)).json()
    assert rols["total"] == len(FIX.rollouts)
    assert by_key(rols["items"], "id") == by_key(FIX.rollouts, "id")

    # Filters and detail routes
    stable_pub = (await get(api, ADMIN, "/releases", channel="stable", status="published", pageSize=200)).json()[
        "items"
    ]
    assert {r["id"] for r in stable_pub} == {
        r["id"] for r in FIX.releases if r["channel"] == "stable" and r["status"] == "published"
    }
    drafts = (await get(api, ADMIN, "/releases", status="draft", pageSize=200)).json()["items"]
    assert [r["id"] for r in drafts] == ["rel-250"]

    pending_rols = (await get(api, ADMIN, "/rollouts", releaseId="rel-241", status="pending", pageSize=200)).json()[
        "items"
    ]
    assert [r["id"] for r in pending_rols] == ["rol-241-2"]

    one = (await get(api, ADMIN, "/releases/rel-241")).json()
    assert one == next(r for r in FIX.releases if r["id"] == "rel-241")
    assert (await get(api, ADMIN, "/releases/rel-missing")).status_code == 404

    # Deny by default
    assert (await get(api, SALES, "/releases")).status_code == 403
    assert (await get(api, SALES, "/rollouts")).status_code == 403
    assert (await get(api, PARTNER, "/releases")).status_code == 403
    assert (await api.get(f"{API}/releases")).status_code == 401
    assert (await api.get(f"{API}/rollouts")).status_code == 401


@pytest.mark.anyio
async def test_partner_viewer_sees_no_releases_or_rollouts(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner, _ = control_db
    engine = create_engine(owner)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO staff_users (id, display_name, work_email, roles, partner_id, mfa_enrolled, active) "
                    "VALUES ('stf-partner-rel', 'Partner Rel', 'prel@southern.example', ARRAY['partner', 'support'], "
                    "'ptn-south', true, true) ON CONFLICT (id) DO NOTHING"
                )
            )
    finally:
        engine.dispose()

    rels = (await get(api, "stf-partner-rel", "/releases", pageSize=200)).json()
    assert rels["total"] == 0 and rels["items"] == []
    assert (await get(api, "stf-partner-rel", "/releases/rel-241")).status_code == 404
    rols = (await get(api, "stf-partner-rel", "/rollouts", pageSize=200)).json()
    assert rols["total"] == 0 and rols["items"] == []


@pytest.mark.anyio
async def test_agent_update_check_newest_pending_and_rate_limit(
    api: httpx2.AsyncClient, control_db: tuple[str, str], caplog: pytest.LogCaptureFixture
) -> None:
    owner, _ = control_db
    # dep-in-1 is already on 2.4.1 (the newest published release on stable) → null, plus rate-limited on retry.
    tok_in = issue_token(owner, "dep-in-1")
    caplog.set_level(logging.INFO, logger="nexus.control.releases")
    res_in = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok_in}"})
    assert res_in.status_code == 200 and res_in.json() == {"release": None, "manifest": None}
    assert any("dep-in-1" in rec.message and "outcome=none" in rec.message for rec in caplog.records)
    assert all(tok_in not in rec.message for rec in caplog.records)

    again = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok_in}"})
    assert again.status_code == 429

    # dep-us-nb is on 2.4.0, but its rollout of 2.4.1 (rol-241-2) is only pending → null.
    tok_nb = issue_token(owner, "dep-us-nb")
    res_nb = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok_nb}"})
    assert res_nb.status_code == 200 and res_nb.json() == {"release": None, "manifest": None}


@pytest.mark.anyio
async def test_agent_update_check_offers_done_and_running_and_blocks_draft_preview_min_upgrade(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner, _ = control_db
    extra_deps = ("dep-t-done", "dep-t-old", "dep-t-prev", "dep-t-run")
    extra_rels = ("rel-t-242rc", "rel-t-243")
    extra_rols = ("rol-t-241-done", "rol-t-250-draft", "rol-t-242rc", "rol-t-250rc-prev", "rol-t-243-run")
    stub_manifest = '{"format":"nexus-release/1","manifest":{"version":"stub"},"signature":"' + ("A" * 86) + '=="}'
    engine = create_engine(owner)
    try:
        with engine.begin() as conn:
            conn.execute(
                text("UPDATE releases SET signed_manifest = :m WHERE id IN ('rel-241', 'rel-250-rc1')"),
                {"m": stub_manifest},
            )
            conn.execute(
                text(
                    "INSERT INTO deployments"
                    " (id, name, kind, account_id, region, version, channel, health,"
                    "  last_check_in_at, telemetry_enabled, air_gapped, extension_ids, tenant_count)"
                    " VALUES"
                    " ('dep-t-done', 'Test Done', 'self_hosted', 'acc-ct', 'in', '2.4.0', 'stable', 'healthy',"
                    "  '2026-09-15T06:00:00Z', true, false, ARRAY[]::text[], 1),"
                    " ('dep-t-old', 'Test Too Old', 'self_hosted', 'acc-ct', 'in', '2.1.0', 'stable', 'healthy',"
                    "  '2026-09-15T06:00:00Z', true, false, ARRAY[]::text[], 1),"
                    " ('dep-t-prev', 'Test Preview', 'self_hosted', 'acc-ct', 'in', '2.4.0', 'preview', 'healthy',"
                    "  '2026-09-15T06:00:00Z', true, false, ARRAY[]::text[], 1),"
                    " ('dep-t-run', 'Test Running', 'self_hosted', 'acc-ct', 'in', '2.4.0', 'stable', 'healthy',"
                    "  '2026-09-15T06:00:00Z', true, false, ARRAY[]::text[], 1)"
                )
            )
            # A pre-release mistakenly tagged on stable (must never be offered on stable) + a newer 2.4.3 release.
            conn.execute(
                text(
                    "INSERT INTO releases"
                    " (id, version, channel, status, published_at, signed, offline_bundle,"
                    "  min_upgrade_from, migration_notes, notes_ai_drafted, signed_manifest)"
                    " VALUES"
                    " ('rel-t-242rc', '2.4.2-rc.1', 'stable', 'published', '2026-09-05T10:00:00Z', true, true,"
                    "  '2.2.0', 'Pre-release test', false, :m),"
                    " ('rel-t-243', '2.4.3', 'stable', 'published', '2026-09-06T10:00:00Z', true, true,"
                    "  '2.2.0', 'Patch release', false, :m)"
                ),
                {"m": stub_manifest},
            )
            # Rollouts: done for rel-241, done for draft rel-250, done for stable pre-release, done for preview rc,
            # and running for 2.4.3.
            conn.execute(
                text(
                    "INSERT INTO rollouts (id, release_id, ring, deployment_ids, status, started_at) VALUES"
                    " ('rol-t-241-done', 'rel-241', 3, ARRAY['dep-t-done', 'dep-t-old'],"
                    "  'done', '2026-09-04T12:00:00Z'),"
                    " ('rol-t-250-draft', 'rel-250', 0, ARRAY['dep-t-done'], 'done', '2026-09-12T12:00:00Z'),"
                    " ('rol-t-242rc', 'rel-t-242rc', 0, ARRAY['dep-t-done'], 'done', '2026-09-05T12:00:00Z'),"
                    " ('rol-t-250rc-prev', 'rel-250-rc1', 0, ARRAY['dep-t-done', 'dep-t-prev'],"
                    "  'done', '2026-09-11T12:00:00Z'),"
                    " ('rol-t-243-run', 'rel-t-243', 0, ARRAY['dep-t-run'], 'running', '2026-09-07T12:00:00Z')"
                )
            )

        # dep-t-done (2.4.0, stable): skips draft 2.5.0, skips preview 2.5.0-rc.1, skips stable pre-release 2.4.2-rc.1,
        # and gets published signed 2.4.1 from its done rollout along with its stored manifest.
        tok_done = issue_token(owner, "dep-t-done")
        r_done = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok_done}"})
        assert r_done.status_code == 200
        assert r_done.json()["release"] == next(r for r in FIX.releases if r["id"] == "rel-241")
        assert r_done.json()["manifest"]["format"] == "nexus-release/1"

        # dep-t-old (2.1.0, stable): below rel-241's minUpgradeFrom (2.2.0) → null.
        tok_old = issue_token(owner, "dep-t-old")
        r_old = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok_old}"})
        assert r_old.status_code == 200 and r_old.json() == {"release": None, "manifest": None}

        # dep-t-prev (2.4.0, preview): gets preview pre-release 2.5.0-rc.1.
        tok_prev = issue_token(owner, "dep-t-prev")
        r_prev = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok_prev}"})
        assert r_prev.status_code == 200
        assert r_prev.json()["release"] == next(r for r in FIX.releases if r["id"] == "rel-250-rc1")
        assert r_prev.json()["manifest"]["format"] == "nexus-release/1"

        # dep-t-run (2.4.0, stable): gets 2.4.3 from its running rollout.
        tok_run = issue_token(owner, "dep-t-run")
        r_run = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok_run}"})
        assert r_run.status_code == 200 and r_run.json()["release"]["id"] == "rel-t-243"
    finally:
        with engine.begin() as conn:
            conn.execute(text("UPDATE releases SET signed_manifest = NULL WHERE id IN ('rel-241', 'rel-250-rc1')"))
            conn.execute(
                text("DELETE FROM deployment_agent_tokens WHERE deployment_id = ANY(:ids)"), {"ids": list(extra_deps)}
            )
            conn.execute(text("DELETE FROM rollouts WHERE id = ANY(:ids)"), {"ids": list(extra_rols)})
            conn.execute(text("DELETE FROM releases WHERE id = ANY(:ids)"), {"ids": list(extra_rels)})
            conn.execute(text("DELETE FROM deployments WHERE id = ANY(:ids)"), {"ids": list(extra_deps)})
        engine.dispose()


@pytest.mark.anyio
async def test_agent_update_rejects_bad_revoked_cookie_and_airgapped(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner, app_url = control_db
    tok = issue_token(owner, "dep-ct")
    assert revoke_token(owner, "dep-ct") is True

    unknown = await api.get(f"{API}/agent/update", headers={"Authorization": "Bearer nope"})
    revoked = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok}"})
    assert unknown.status_code == 401 and revoked.status_code == 401
    assert unknown.json()["error"]["code"] == revoked.json()["error"]["code"] == "unauthorized"
    assert unknown.json()["error"]["message"] == revoked.json()["error"]["message"]

    # Staff cookie / header alone → 401.
    async_eng = create_async_engine(app_url)
    try:
        cookie = await DbSessionStore(async_eng).create(ADMIN, 60)
    finally:
        await async_eng.dispose()
    cookie_only = await api.get(
        f"{API}/agent/update",
        headers={"Cookie": f"{SESSION_COOKIE}={cookie}", "X-Nexus-Staff": ADMIN},
    )
    assert cookie_only.status_code == 401

    # Air-gapped deployment → 403.
    tok_al = issue_token(owner, "dep-al")
    airgapped = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok_al}"})
    assert airgapped.status_code == 403


def test_select_update_offer_never_offers_unsigned_or_withdrawn() -> None:
    base = next(r for r in FIX.releases if r["id"] == "rel-241")
    unsigned = Release.model_validate({**base, "id": "rel-u", "version": "2.4.9", "signed": False})
    withdrawn = Release.model_validate({**base, "id": "rel-w", "version": "2.4.8", "status": "withdrawn"})
    assert select_update_offer([unsigned, withdrawn], "2.4.0", "stable") is None


def test_control_app_cannot_write_releases_or_rollouts_and_db_blocks_unsigned_published(
    control_db: tuple[str, str],
) -> None:
    owner_url, app_url = control_db
    app_eng = create_engine(app_url)
    try:
        for sql in (
            "INSERT INTO releases (id, version, channel, status, published_at, signed, offline_bundle, "
            "min_upgrade_from, migration_notes, notes_ai_drafted) VALUES "
            "('rel-x', '2.9.0', 'stable', 'draft', NULL, false, true, '2.4.0', '', false)",
            "UPDATE releases SET status = 'withdrawn' WHERE id = 'rel-241'",
            "DELETE FROM releases WHERE id = 'rel-241'",
            "INSERT INTO rollouts (id, release_id, ring, deployment_ids, status, started_at) VALUES "
            "('rol-x', 'rel-241', 3, ARRAY['dep-in-1'], 'pending', NULL)",
            "UPDATE rollouts SET status = 'done' WHERE id = 'rol-241-2'",
            "DELETE FROM rollouts WHERE id = 'rol-241-2'",
        ):
            with pytest.raises(ProgrammingError), app_eng.begin() as conn:
                conn.execute(text(sql))
    finally:
        app_eng.dispose()

    owner_eng = create_engine(owner_url)
    try:
        with pytest.raises(IntegrityError), owner_eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO releases (id, version, channel, status, published_at, signed, offline_bundle, "
                    "min_upgrade_from, migration_notes, notes_ai_drafted) VALUES "
                    "('rel-unsigned-pub', '2.9.9', 'stable', 'published', '2026-09-20T00:00:00Z', false, true, "
                    "'2.4.0', '', false)"
                )
            )
    finally:
        owner_eng.dispose()
