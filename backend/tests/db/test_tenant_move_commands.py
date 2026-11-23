"""DB tests for cell-side P18 tenant move commands (`tenant.import_key`, `tenant.import`, D61, NEX-135)."""

import json
import logging
import secrets
import shutil
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from nexus.agent.commands import COMMAND_KEYS, HANDLERS, poll_commands
from nexus.agent.jobs import (
    backup_dir,
    handle_tenant_import,
    handle_tenant_import_key,
    import_dir,
)
from nexus.agent.tenant_export import IMPORT_KEY_NAME, pem_fingerprint
from nexus.commands.format import DEFAULT_KEY, CommandPayload, new_command_id, public_key_file, sign_command
from nexus.core.freeze import handle_tenant_export, handle_tenant_freeze
from nexus.core.vault import FakeVault
from nexus.modules.m02.keycloak_admin import FakeKeycloakAdmin
from nexus.provisioning.tenant import ProvisionOwner, ProvisionTenantArgs, provision_tenant
from nexus.seed.demo import reset_tenant
from nexus.settings import Settings
from tests.db.conftest import DbUrls, create_test_database, drop_test_database, migrate

TENANT_ID = "ten-move-01"
OWNER_EMAIL = "owner@move-test.example.edu"
OWNER_NAME = "Suresh Kumar"


def _seed_plan(owner_url: str) -> None:
    eng = create_engine(owner_url)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO plans (id, code, name_key, modules, ai_credits_per_month, learner_limit) VALUES "
                    "('pln-standard', 'standard', 'm05.plan.standard', ARRAY['M10', 'M11'], 500, 1000) "
                    "ON CONFLICT (id) DO NOTHING"
                )
            )
    finally:
        eng.dispose()


def _settings(owner_url: str, app_url: str, tmp_path: Path, dep_id: str, **overrides: Any) -> Settings:
    data: dict[str, Any] = {
        "install_mode": "saas",
        "region": "in",
        "deployment_id": dep_id,
        "install_dir": tmp_path,
        "control_url": "https://control.nexuscampus.example",
        "control_agent_token": SecretStr("tok-move-test"),
        "database_url": SecretStr(app_url),
        "migrate_database_url": SecretStr(owner_url),
    }
    data.update(overrides)
    return Settings(**data)


async def _sign_one(
    vault: FakeVault, dep_id: str, kind: str, args: dict[str, Any], tenant_id: str | None = None
) -> dict[str, str]:
    now = datetime.now(UTC)
    payload = CommandPayload(
        id=new_command_id(),
        deployment_id=dep_id,
        tenant_id=tenant_id,
        kind=kind,
        args=args,
        issued_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        expires_at=(now + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        issued_by="stf-0023",
        signing_key_id="placeholder",
    )
    raw, sig = await sign_command(vault, DEFAULT_KEY, payload)
    return {"id": payload.id, "command": raw, "signature": sig}


def _poll_one(app_eng: Any, cfg: Settings, item: dict[str, str], vault: FakeVault) -> tuple[Any, list[dict[str, Any]]]:
    reports: list[dict[str, Any]] = []

    def handler(req: httpx2.Request) -> httpx2.Response:
        if req.method == "GET" and req.url.path.endswith("/agent/commands"):
            return httpx2.Response(200, json={"items": [{"command": item["command"], "signature": item["signature"]}]})
        if req.method == "POST" and req.url.path.endswith("/result"):
            reports.append(json.loads(req.content.decode("utf-8")))
            return httpx2.Response(200, json={"ok": True})
        return httpx2.Response(404)

    custom = {
        **HANDLERS,
        "tenant.freeze": handle_tenant_freeze,
        "tenant.export": lambda c, e, s: handle_tenant_export(c, e, s, vault=vault),
        "tenant.import_key": lambda c, e, s: handle_tenant_import_key(c, e, s, vault=vault),
        "tenant.import": lambda c, e, s: handle_tenant_import(c, e, s, vault=vault),
    }
    return poll_commands(app_eng, cfg, transport=httpx2.MockTransport(handler), handlers=custom), reports


@pytest.mark.anyio
async def test_move_import_key_and_tenant_import_end_to_end_and_refusals(
    test_db: DbUrls, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    _seed_plan(test_db.owner_url)
    src_dir, dst_dir = tmp_path / "src", tmp_path / "dst"
    src_dir.mkdir()
    dst_dir.mkdir()

    # Second empty migrated database acts as destination cell
    dst_db_name = f"nexus_move_dst_{secrets.token_hex(4)}"
    dst_owner_url, dst_app_pw = create_test_database(dst_db_name)
    dst_app_url = make_url(dst_owner_url).set(username="nexus_app", password=dst_app_pw).render_as_string(False)

    cmd_vault = FakeVault()
    await cmd_vault.create_signing_key(DEFAULT_KEY)
    pinned = json.dumps(await public_key_file(cmd_vault, DEFAULT_KEY))
    (src_dir / COMMAND_KEYS).write_text(pinned, encoding="utf-8")
    (dst_dir / COMMAND_KEYS).write_text(pinned, encoding="utf-8")

    src_cfg = _settings(test_db.owner_url, test_db.app_url, src_dir, "dep-in-1")
    dst_cfg = _settings(dst_owner_url, dst_app_url, dst_dir, "dep-eu-1", region="eu")
    src_vault, dst_vault = FakeVault(), FakeVault()
    src_app_eng = create_engine(test_db.app_url)
    dst_app_eng = None
    src_owner_eng = create_engine(test_db.owner_url)

    try:
        migrate(dst_owner_url, dst_app_pw)
        _seed_plan(dst_owner_url)
        dst_app_eng = create_engine(dst_app_url)

        # Provision a throwaway tenant on source cell
        prov = await provision_tenant(
            src_cfg,
            src_vault,
            FakeKeycloakAdmin(),
            ProvisionTenantArgs.model_validate(
                {
                    "tenantId": TENANT_ID,
                    "name": "Move Test School",
                    "institutionType": "k12",
                    "region": "in",
                    "planCode": "standard",
                    "owner": ProvisionOwner(legal_name=OWNER_NAME, work_email=OWNER_EMAIL),
                }
            ),
        )
        assert prov.failed_step is None

        # 1. Destination cell returns its import key PEM + matching sha256
        with caplog.at_level(logging.INFO, logger="nexus.agent.jobs"):
            ik_cmd = await _sign_one(cmd_vault, "dep-eu-1", "tenant.import_key", {})
            res_ik, rep_ik = _poll_one(dst_app_eng, dst_cfg, ik_cmd, dst_vault)
        assert res_ik.done == 1 and rep_ik[0]["status"] == "done"
        dest_pem = rep_ik[0]["result"]["pem"]
        dest_sha = rep_ik[0]["result"]["pemSha256"]
        assert dest_sha == pem_fingerprint(dest_pem)
        assert dest_sha == pem_fingerprint(await dst_vault.public_key_pem(IMPORT_KEY_NAME))

        # 2. Source cell freezes + exports for destination PEM
        frz_cmd = await _sign_one(cmd_vault, "dep-in-1", "tenant.freeze", {"tenantId": TENANT_ID}, TENANT_ID)
        _, rep_frz = _poll_one(src_app_eng, src_cfg, frz_cmd, src_vault)
        assert rep_frz[0]["status"] == "done"

        exp_cmd = await _sign_one(
            cmd_vault, "dep-in-1", "tenant.export", {"tenantId": TENANT_ID, "recipientPem": dest_pem}, TENANT_ID
        )
        _, rep_exp = _poll_one(src_app_eng, src_cfg, exp_cmd, src_vault)
        assert rep_exp[0]["status"] == "done"
        file_name = rep_exp[0]["result"]["fileName"]
        exported_rows = rep_exp[0]["result"]["rows"]

        # Place encrypted export into destination's import_dir
        import_dir(dst_cfg).mkdir(parents=True, exist_ok=True)
        dst_file = import_dir(dst_cfg) / file_name
        shutil.copy2(backup_dir(src_cfg) / file_name, dst_file)

        # 3. Refusals before valid import (nothing written, file still present)
        for bad_args, expected_status, expected_reason in (
            (
                {
                    "tenantId": TENANT_ID,
                    "fileName": f"../{file_name}",
                    "pemSha256": dest_sha,
                    "expectedRows": exported_rows,
                },
                "rejected",
                "invalid_file_name",
            ),
            (
                {"tenantId": "ten-other", "fileName": file_name, "pemSha256": dest_sha, "expectedRows": exported_rows},
                "rejected",
                "tenant_mismatch",
            ),
            (
                {"tenantId": TENANT_ID, "fileName": file_name, "pemSha256": "0" * 64, "expectedRows": exported_rows},
                "rejected",
                "fingerprint_mismatch",
            ),
            (
                {
                    "tenantId": TENANT_ID,
                    "fileName": file_name,
                    "pemSha256": dest_sha,
                    "expectedRows": exported_rows + 5,
                },
                "rejected",
                "row_count_mismatch",
            ),
        ):
            bad_cmd = await _sign_one(cmd_vault, "dep-eu-1", "tenant.import", bad_args, bad_args["tenantId"])
            _, rep_bad = _poll_one(dst_app_eng, dst_cfg, bad_cmd, dst_vault)
            assert rep_bad[0] == {"status": expected_status, "result": {"reason": expected_reason}}
            assert dst_file.is_file()

        dst_owner_eng = create_engine(dst_owner_url)
        try:
            with dst_owner_eng.connect() as conn:
                assert conn.execute(text("SELECT count(*) FROM tenants")).scalar_one() == 0

            # 4. Valid tenant.import loads rows, verifies chain & checkpoint, removes file
            with caplog.at_level(logging.INFO, logger="nexus.agent.jobs"):
                imp_cmd = await _sign_one(
                    cmd_vault,
                    "dep-eu-1",
                    "tenant.import",
                    {
                        "tenantId": TENANT_ID,
                        "fileName": file_name,
                        "pemSha256": dest_sha,
                        "expectedRows": exported_rows,
                    },
                    TENANT_ID,
                )
                res_imp, rep_imp = _poll_one(dst_app_eng, dst_cfg, imp_cmd, dst_vault)
            assert res_imp.done == 1 and rep_imp[0]["status"] == "done"
            imp_res = rep_imp[0]["result"]
            assert set(imp_res) == {"tenantId", "rows", "checkpointsSkipped", "chainOk", "checkpointOk"}
            assert imp_res["tenantId"] == TENANT_ID
            assert imp_res["rows"] == exported_rows - imp_res["checkpointsSkipped"]
            assert imp_res["chainOk"] is True and imp_res["checkpointOk"] is True
            assert not dst_file.exists()

            # 5. Replayed command id is skipped (not run twice)
            res_replay, rep_replay = _poll_one(dst_app_eng, dst_cfg, imp_cmd, dst_vault)
            assert res_replay.skipped == 1 and res_replay.done == 0 and rep_replay == []

            # 6. Existing tenant refused (even if file is copied back with a fresh command id)
            shutil.copy2(backup_dir(src_cfg) / file_name, dst_file)
            imp_dup = await _sign_one(
                cmd_vault,
                "dep-eu-1",
                "tenant.import",
                {"tenantId": TENANT_ID, "fileName": file_name, "pemSha256": dest_sha, "expectedRows": exported_rows},
                TENANT_ID,
            )
            _, rep_dup = _poll_one(dst_app_eng, dst_cfg, imp_dup, dst_vault)
            assert rep_dup[0] == {"status": "failed", "result": {"reason": "import_refused"}}
            assert dst_file.is_file()

            # 7. No personal data in command results or logs
            combined = json.dumps([rep_ik, rep_imp]) + "\n" + "\n".join(r.getMessage() for r in caplog.records)
            assert OWNER_NAME not in combined and OWNER_EMAIL not in combined
        finally:
            dst_owner_eng.dispose()
    finally:
        with src_owner_eng.begin() as conn:
            reset_tenant(conn, TENANT_ID)
            conn.execute(text("DELETE FROM agent_commands"))
            conn.execute(text("DELETE FROM install_backups WHERE kind = 'tenant_export'"))
        src_owner_eng.dispose()
        src_app_eng.dispose()
        if dst_app_eng is not None:
            dst_app_eng.dispose()
        drop_test_database(dst_db_name)
