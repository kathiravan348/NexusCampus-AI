"""P07 release publish, rollout start, and health check-in rollout completion tests (NEX-130)."""

from datetime import UTC, datetime
from typing import Literal

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

from nexus.core.vault import FakeVault
from nexus.devtools.agent_token import issue_token
from nexus.releases.manifest import DEFAULT_KEY, ReleaseImage, ReleaseManifest, sign_release

API = "/control/api/v1"
ADMIN, SALES = "stf-0001", "stf-0011"


async def _sign_manifest_json(
    vault: FakeVault,
    version: str,
    channel: Literal["stable", "lts", "preview"] = "stable",
    min_upgrade_from: str = "2.4.0",
) -> str:
    manifest = ReleaseManifest(
        version=version,
        channel=channel,
        min_upgrade_from=min_upgrade_from,
        published_at="2026-11-23T00:00:00Z",
        images=[ReleaseImage(name="api", ref=f"nexuscampus/api:{version}", image_id="sha256:" + "a" * 64)],
        migrations={"product": "0020_agent_commands"},
        notes_sha256="b" * 64,
        signing_key_id=f"{DEFAULT_KEY}:v0",
    )
    return (await sign_release(manifest, vault, DEFAULT_KEY)).to_json()


@pytest.mark.anyio
async def test_publish_release_guards_and_happy_path(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault
) -> None:
    owner, _ = control_db
    # Permission denied
    assert (
        await api.post(f"{API}/releases/rel-250/publish", headers={"X-Nexus-Staff": SALES}, json={})
    ).status_code == 403
    assert (
        await api.post(f"{API}/releases/rel-missing/publish", headers={"X-Nexus-Staff": ADMIN}, json={})
    ).status_code == 404
    # Not draft -> 409
    assert (
        await api.post(f"{API}/releases/rel-241/publish", headers={"X-Nexus-Staff": ADMIN}, json={})
    ).status_code == 409
    # AI-drafted notes without review -> 422
    r_ai = await api.post(f"{API}/releases/rel-250/publish", headers={"X-Nexus-Staff": ADMIN}, json={})
    assert r_ai.status_code == 422
    assert r_ai.json()["error"]["details"][0]["path"] == "notesReviewed"
    # Unsigned (no signed_manifest) -> 409
    r_uns = await api.post(
        f"{API}/releases/rel-250/publish", headers={"X-Nexus-Staff": ADMIN}, json={"notesReviewed": True}
    )
    assert r_uns.status_code == 409

    # Mismatched manifest (wrong version) -> 409
    wrong_json = await _sign_manifest_json(fake_vault, "2.5.1")
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(
                text("UPDATE releases SET signed_manifest = :m, signed = true WHERE id = 'rel-250'"),
                {"m": wrong_json},
            )
    finally:
        eng.dispose()
    r_mis = await api.post(
        f"{API}/releases/rel-250/publish", headers={"X-Nexus-Staff": ADMIN}, json={"notesReviewed": True}
    )
    assert r_mis.status_code == 409

    # Valid signed manifest -> 200 published
    good_json = await _sign_manifest_json(fake_vault, "2.5.0")
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(
                text("UPDATE releases SET signed_manifest = :m, signed = true WHERE id = 'rel-250'"),
                {"m": good_json},
            )
    finally:
        eng.dispose()
    r_ok = await api.post(
        f"{API}/releases/rel-250/publish", headers={"X-Nexus-Staff": ADMIN}, json={"notesReviewed": True}
    )
    assert r_ok.status_code == 200
    body = r_ok.json()
    assert body["id"] == "rel-250" and body["status"] == "published" and body["signed"] is True and body["publishedAt"]


@pytest.mark.anyio
async def test_rollout_start_update_offer_and_health_completion(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault
) -> None:
    owner, app_url = control_db
    # Ensure rel-250 is published with a valid manifest and create ring 0 (dep-eu-1) + ring 1 (dep-in-1)
    good_json = await _sign_manifest_json(fake_vault, "2.5.0")
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "UPDATE releases SET status = 'published', signed = true, "
                    "published_at = now(), signed_manifest = :m WHERE id = 'rel-250'"
                ),
                {"m": good_json},
            )
            conn.execute(
                text(
                    "INSERT INTO rollouts (id, release_id, ring, deployment_ids, status, started_at) VALUES "
                    "('rol-250-0', 'rel-250', 0, ARRAY['dep-eu-1'], 'pending', NULL), "
                    "('rol-250-1', 'rel-250', 1, ARRAY['dep-in-1'], 'pending', NULL)"
                )
            )
            conn.execute(text("UPDATE deployments SET last_check_in_at = NULL WHERE id = 'dep-eu-1'"))
    finally:
        eng.dispose()

    # Permission / unknown / ring order guards
    assert (await api.post(f"{API}/rollouts/rol-250-0/start", headers={"X-Nexus-Staff": SALES})).status_code == 403
    assert (await api.post(f"{API}/rollouts/rol-missing/start", headers={"X-Nexus-Staff": ADMIN})).status_code == 404
    assert (await api.post(f"{API}/rollouts/rol-250-1/start", headers={"X-Nexus-Staff": ADMIN})).status_code == 409

    # Start ring 0 -> running
    r0 = await api.post(f"{API}/rollouts/rol-250-0/start", headers={"X-Nexus-Staff": ADMIN})
    assert r0.status_code == 200
    assert r0.json()["status"] == "running" and r0.json()["startedAt"] is not None
    # Already running -> 409; ring 1 still blocked until ring 0 is done -> 409
    assert (await api.post(f"{API}/rollouts/rol-250-0/start", headers={"X-Nexus-Staff": ADMIN})).status_code == 409
    assert (await api.post(f"{API}/rollouts/rol-250-1/start", headers={"X-Nexus-Staff": ADMIN})).status_code == 409

    # Agent update check for dep-eu-1 now offers 2.5.0
    tok_eu = issue_token(owner, "dep-eu-1")
    r_upd = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok_eu}"})
    assert r_upd.status_code == 200
    assert r_upd.json()["release"]["id"] == "rel-250"

    # dep-eu-1 checks in at 2.5.0 -> rol-250-0 automatically becomes done!
    now_iso = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    r_chk = await api.post(
        f"{API}/agent/health",
        headers={"Authorization": f"Bearer {tok_eu}"},
        json={
            "at": now_iso,
            "version": "2.5.0",
            "uptimePct": 99.9,
            "errorRatePct": 0.1,
            "p95LatencyMs": 120,
            "queueDepth": 0,
            "diskUsedPct": 40.0,
            "activeUsers": 12,
        },
    )
    assert r_chk.status_code == 204

    rols = (await api.get(f"{API}/rollouts", params={"releaseId": "rel-250"}, headers={"X-Nexus-Staff": ADMIN})).json()[
        "items"
    ]
    assert next(r for r in rols if r["id"] == "rol-250-0")["status"] == "done"

    # Now ring 1 can start!
    r1 = await api.post(f"{API}/rollouts/rol-250-1/start", headers={"X-Nexus-Staff": ADMIN})
    assert r1.status_code == 200 and r1.json()["status"] == "running"

    # control_app cannot update non-granted columns on releases or rollouts
    app_eng = create_engine(app_url)
    try:
        for sql in (
            "UPDATE releases SET signed_manifest = '{}' WHERE id = 'rel-250'",
            "UPDATE releases SET migration_notes = 'x' WHERE id = 'rel-250'",
            "UPDATE rollouts SET deployment_ids = ARRAY['dep-in-1'] WHERE id = 'rol-250-0'",
        ):
            with pytest.raises(ProgrammingError), app_eng.begin() as conn:
                conn.execute(text(sql))
    finally:
        app_eng.dispose()
