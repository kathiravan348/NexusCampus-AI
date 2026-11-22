"""Control release manifest import (`nexus-control-release-import`, NEX-117) and `/agent/update` manifest delivery."""

import asyncio
import json
from pathlib import Path
from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

from nexus.core.vault import FakeVault
from nexus.devtools.agent_token import issue_token
from nexus.devtools.release_import import import_manifest
from nexus.releases.manifest import ReleaseManifest, SignedRelease, sign_release

API = "/control/api/v1"


async def _sign(
    vault: FakeVault,
    *,
    version: str = "2.4.1",
    channel: str = "stable",
    min_upgrade_from: str = "2.2.0",
    security_fix: bool = True,
    key_name: str = "nexus-release",
) -> SignedRelease:
    manifest = ReleaseManifest.model_validate(
        {
            "version": version,
            "channel": channel,
            "minUpgradeFrom": min_upgrade_from,
            "publishedAt": "2026-09-01T10:00:00Z",
            "images": [{"name": "api", "ref": f"nexuscampus/api:{version}", "imageId": "sha256:" + "a" * 64}],
            "migrations": {"product": "0019_install_active_users", "control": "c0008_release_manifests"},
            "notesSha256": "b" * 64,
            "securityFix": security_fix,
            "files": [],
            "signingKeyId": "pending",
        }
    )
    return await sign_release(manifest, vault, key_name=key_name)


@pytest.mark.anyio
async def test_import_valid_manifest_enables_agent_update_and_stays_hidden_from_releases_api(
    api: httpx2.AsyncClient, control_db: tuple[str, str], tmp_path: Path
) -> None:
    owner, app_url = control_db
    vault = FakeVault()
    signed = await _sign(vault, version="2.4.1", channel="stable", min_upgrade_from="2.2.0")
    path = tmp_path / "nexuscampus-2.4.1.release.json"
    path.write_text(signed.to_json() + "\n", encoding="utf-8")

    engine = create_engine(owner)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO deployments"
                    " (id, name, kind, account_id, region, version, channel, health,"
                    "  last_check_in_at, telemetry_enabled, air_gapped, extension_ids, tenant_count)"
                    " VALUES"
                    " ('dep-imp-1', 'Import Test', 'self_hosted', 'acc-ct', 'in', '2.4.0', 'stable', 'healthy',"
                    "  '2026-09-15T06:00:00Z', true, false, ARRAY[]::text[], 1),"
                    " ('dep-imp-2', 'Import Test 2', 'self_hosted', 'acc-ct', 'in', '2.4.0', 'stable', 'healthy',"
                    "  '2026-09-15T06:00:00Z', true, false, ARRAY[]::text[], 1)"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO rollouts (id, release_id, ring, deployment_ids, status, started_at) VALUES"
                    " ('rol-imp-241', 'rel-241', 3, ARRAY['dep-imp-1', 'dep-imp-2'], 'done', '2026-09-04T12:00:00Z')"
                )
            )

        # Before import: rel-241 has no stored manifest → `/agent/update` offers nothing.
        tok1 = issue_token(owner, "dep-imp-1")
        before = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok1}"})
        assert before.status_code == 200 and before.json() == {"release": None, "manifest": None}

        # Import stores the verified manifest on rel-241.
        rel_id, imported = await import_manifest(owner, path, vault)
        assert rel_id == "rel-241" and imported.manifest.version == "2.4.1"

        # Internal `signed_manifest` never leaks into `GET /releases/:id`.
        rel_out = (await api.get(f"{API}/releases/rel-241", headers={"X-Nexus-Staff": "stf-0001"})).json()
        assert "signedManifest" not in rel_out and "signed_manifest" not in rel_out

        # After import: `/agent/update` returns both release and the exact signed manifest JSON.
        tok2 = issue_token(owner, "dep-imp-2")
        after = await api.get(f"{API}/agent/update", headers={"Authorization": f"Bearer {tok2}"})
        assert after.status_code == 200
        body = after.json()
        assert body["release"]["id"] == "rel-241"
        assert body["manifest"] == json.loads(path.read_text(encoding="utf-8"))

        # `control_app` cannot write `signed_manifest`.
        app_eng = create_engine(app_url)
        try:
            with pytest.raises(ProgrammingError), app_eng.begin() as conn:
                conn.execute(text("UPDATE releases SET signed_manifest = NULL WHERE id = 'rel-241'"))
        finally:
            app_eng.dispose()
    finally:
        with engine.begin() as conn:
            conn.execute(text("UPDATE releases SET signed_manifest = NULL WHERE id = 'rel-241'"))
            conn.execute(text("DELETE FROM deployment_agent_tokens WHERE deployment_id IN ('dep-imp-1', 'dep-imp-2')"))
            conn.execute(text("DELETE FROM rollouts WHERE id = 'rol-imp-241'"))
            conn.execute(text("DELETE FROM deployments WHERE id IN ('dep-imp-1', 'dep-imp-2')"))
        engine.dispose()


def test_import_refuses_tampered_unknown_key_mismatches_and_withdrawn(
    control_db: tuple[str, str], tmp_path: Path
) -> None:
    owner, _ = control_db
    vault = FakeVault()
    other_vault = FakeVault()

    def write(name: str, data: dict[str, Any]) -> Path:
        p = tmp_path / name
        p.write_text(json.dumps(data), encoding="utf-8")
        return p

    # 1. Tampered manifest → bad_signature
    signed = asyncio.run(_sign(vault, version="2.4.1", channel="stable", min_upgrade_from="2.2.0"))
    tampered = json.loads(signed.to_json())
    tampered["manifest"]["securityFix"] = not tampered["manifest"]["securityFix"]
    with pytest.raises(ValueError, match="bad_signature"):
        asyncio.run(import_manifest(owner, write("tampered.json", tampered), vault))

    # 2. Signed by an unknown key → unknown_key; signed by different key with same key id → bad_signature.
    signed_other = asyncio.run(_sign(other_vault, version="2.4.1", channel="stable", min_upgrade_from="2.2.0"))
    signed_unknown = asyncio.run(
        _sign(other_vault, version="2.4.1", channel="stable", min_upgrade_from="2.2.0", key_name="other-release-key")
    )
    with pytest.raises(ValueError, match="unknown_key"):
        asyncio.run(import_manifest(owner, write("unknown_key.json", json.loads(signed_unknown.to_json())), vault))
    with pytest.raises(ValueError, match="bad_signature"):
        asyncio.run(import_manifest(owner, write("wrong_key.json", json.loads(signed_other.to_json())), vault))

    # 3. No matching version row
    missing_ver = asyncio.run(_sign(vault, version="2.9.9", channel="stable", min_upgrade_from="2.2.0"))
    with pytest.raises(ValueError, match="no release row"):
        asyncio.run(import_manifest(owner, write("missing_ver.json", json.loads(missing_ver.to_json())), vault))

    # 4. Channel mismatch (2.4.1 exists on stable, not lts)
    wrong_chan = asyncio.run(_sign(vault, version="2.4.1", channel="lts", min_upgrade_from="2.2.0"))
    with pytest.raises(ValueError, match="no release row"):
        asyncio.run(import_manifest(owner, write("wrong_chan.json", json.loads(wrong_chan.to_json())), vault))

    # 5. minUpgradeFrom mismatch (rel-241 has 2.2.0, file has 2.3.0)
    wrong_min = asyncio.run(_sign(vault, version="2.4.1", channel="stable", min_upgrade_from="2.3.0"))
    with pytest.raises(ValueError, match="minUpgradeFrom mismatch"):
        asyncio.run(import_manifest(owner, write("wrong_min.json", json.loads(wrong_min.to_json())), vault))

    # 6. Withdrawn release → refused
    engine = create_engine(owner)
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO releases"
                    " (id, version, channel, status, published_at, signed, offline_bundle,"
                    "  min_upgrade_from, migration_notes, notes_ai_drafted)"
                    " VALUES"
                    " ('rel-imp-w', '2.4.8', 'stable', 'withdrawn', '2026-09-05T10:00:00Z', true, true,"
                    "  '2.2.0', 'Withdrawn', false)"
                )
            )
        withdrawn_signed = asyncio.run(_sign(vault, version="2.4.8", channel="stable", min_upgrade_from="2.2.0"))
        with pytest.raises(ValueError, match="withdrawn"):
            asyncio.run(import_manifest(owner, write("withdrawn.json", json.loads(withdrawn_signed.to_json())), vault))
    finally:
        with engine.begin() as conn:
            conn.execute(text("DELETE FROM releases WHERE id = 'rel-imp-w'"))
        engine.dispose()
