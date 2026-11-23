"""DB tests for cell-side 5-step P04 tenant provisioning (`tenant.provision`, NEX-127)."""

import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr
from sqlalchemy import create_engine, text

from nexus.agent.commands import COMMAND_KEYS, poll_commands
from nexus.commands.format import DEFAULT_KEY, CommandPayload, new_command_id, public_key_file, sign_command
from nexus.core.vault import FakeVault
from nexus.modules.m02.keycloak_admin import FakeKeycloakAdmin
from nexus.provisioning import tenant as prov_mod
from nexus.provisioning.tenant import (
    PROVISIONING_STEPS,
    ProvisionOwner,
    ProvisionTenantArgs,
    provision_tenant,
)
from nexus.seed.demo import reset_tenant
from nexus.settings import Settings
from tests.db.conftest import DbUrls

OWNER_EMAIL = "principal@newbridge.example.edu"
OWNER_NAME = "Meera Nair"


def _seed_plans(owner_url: str) -> None:
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


def _args(**overrides: Any) -> ProvisionTenantArgs:
    data: dict[str, Any] = {
        "tenantId": "ten-new-01",
        "name": "Newbridge Academy",
        "institutionType": "k12",
        "region": "in",
        "planCode": "standard",
        "trialDays": 14,
        "owner": ProvisionOwner(legal_name=OWNER_NAME, work_email=OWNER_EMAIL),
    }
    data.update(overrides)
    return ProvisionTenantArgs.model_validate(data)


def _settings(db: DbUrls, tmp_path: Path, **overrides: Any) -> Settings:
    data: dict[str, Any] = {
        "install_mode": "saas",
        "region": "in",
        "deployment_id": "dep-in-1",
        "install_dir": tmp_path,
        "control_url": "https://control.nexuscampus.example",
        "control_agent_token": SecretStr("tok-provision-test"),
        "database_url": SecretStr(db.app_url),
        "migrate_database_url": SecretStr(db.owner_url),
    }
    data.update(overrides)
    return Settings(**data)


@pytest.mark.anyio
async def test_provision_five_steps_rls_idempotency_and_no_pii_in_logs(
    test_db: DbUrls, tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    _seed_plans(test_db.owner_url)
    cfg = _settings(test_db, tmp_path)
    vault = FakeVault()
    kc = FakeKeycloakAdmin()

    with caplog.at_level(logging.INFO, logger="nexus.provisioning"):
        r1 = await provision_tenant(cfg, vault, kc, _args())
    assert r1.steps_done == list(PROVISIONING_STEPS)
    assert r1.failed_step is None and r1.reason is None
    assert "ten-new-01" in kc.organizations
    assert kc.invited == [("ten-new-01", OWNER_EMAIL)]

    # Verify DB state, Vault key, entitlements, RLS isolation
    app_eng = create_engine(test_db.app_url)
    try:
        with app_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-new-01', true)"))
            inst = conn.execute(text("SELECT id, name, type FROM institutions")).first()
            assert inst is not None and inst.name == "Newbridge Academy" and inst.type == "k12"
            key_row = conn.execute(text("SELECT purpose, status FROM vault_keys")).first()
            assert key_row is not None and key_row.purpose == "tenant_data" and key_row.status == "active"
            ents = {
                r.module_id: (r.enabled, r.source)
                for r in conn.execute(text("SELECT module_id, enabled, source FROM entitlements")).all()
            }
            assert ents["M01"] == (True, "core") and ents["M10"] == (True, "trial") and ents["M11"] == (True, "trial")
            roles = conn.execute(text("SELECT count(*) FROM roles WHERE system = true")).scalar_one()
            assert roles == 4
            users = conn.execute(text("SELECT count(*) FROM users")).scalar_one()
            assert users == 1
            audits = conn.execute(text("SELECT count(*) FROM audit_events")).scalar_one()
            assert audits == 5

        # RLS isolates ten-new-01 from any other tenant
        with app_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-other', true)"))
            assert conn.execute(text("SELECT count(*) FROM institutions")).scalar_one() == 0
            assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 0

        # Re-running is completely idempotent (no duplicate users, roles, invites, or audit rows)
        r2 = await provision_tenant(cfg, vault, kc, _args())
        assert r2.steps_done == list(PROVISIONING_STEPS)
        assert kc.invited == [("ten-new-01", OWNER_EMAIL)]
        with app_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', 'ten-new-01', true)"))
            assert conn.execute(text("SELECT count(*) FROM users")).scalar_one() == 1
            assert conn.execute(text("SELECT count(*) FROM roles")).scalar_one() == 4
            assert conn.execute(text("SELECT count(*) FROM audit_events")).scalar_one() == 5
    finally:
        app_eng.dispose()
        owner_eng = create_engine(test_db.owner_url)
        try:
            with owner_eng.begin() as conn:
                for tid in ("ten-new-01", "ten-mid-fail"):
                    reset_tenant(conn, tid)
        finally:
            owner_eng.dispose()

    # No owner PII in logs or result payload
    joined_logs = "\n".join(rec.getMessage() for rec in caplog.records)
    result_text = json.dumps(r1.to_result())
    assert OWNER_EMAIL not in joined_logs and OWNER_NAME not in joined_logs
    assert OWNER_EMAIL not in result_text and OWNER_NAME not in result_text


@pytest.mark.anyio
async def test_provision_failure_midway_preflight_and_self_hosted_rejection(
    test_db: DbUrls, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    _seed_plans(test_db.owner_url)
    cfg = _settings(test_db, tmp_path)
    vault = FakeVault()
    kc = FakeKeycloakAdmin()

    # Wrong region and unknown plan fail before step 1
    r_reg = await provision_tenant(cfg, vault, kc, _args(tenantId="ten-eu-bad", region="eu"))
    assert r_reg.steps_done == [] and r_reg.failed_step is None and r_reg.reason == "wrong_region"

    r_pln = await provision_tenant(cfg, vault, kc, _args(tenantId="ten-pln-bad", planCode="does_not_exist"))
    assert r_pln.steps_done == [] and r_pln.failed_step is None and r_pln.reason == "unknown_plan"

    # Failure in step 3 (apply_profile) reports steps 1-2 done and names apply_profile
    async def boom(*_a: Any, **_kw: Any) -> None:
        raise RuntimeError("secret-internal-detail")

    monkeypatch.setattr(prov_mod, "_step_apply_profile", boom)
    r_mid = await provision_tenant(cfg, vault, kc, _args(tenantId="ten-mid-fail"))
    assert r_mid.steps_done == ["create_tenant", "create_keys"]
    assert r_mid.failed_step == "apply_profile"
    assert r_mid.reason == "step_failed"
    assert "secret-internal-detail" not in json.dumps(r_mid.to_result())

    # Self-hosted install rejects tenant.provision via agent command loop
    cmd_vault = FakeVault()
    now = datetime.now(UTC).replace(microsecond=0)
    cid = new_command_id()
    cmd = CommandPayload(
        id=cid,
        deployment_id="dep-ct",
        tenant_id="ten-sh-no",
        kind="tenant.provision",
        args=_args(tenantId="ten-sh-no").model_dump(by_alias=True),
        issued_at=now.isoformat().replace("+00:00", "Z"),
        expires_at=(now + timedelta(hours=1)).isoformat().replace("+00:00", "Z"),
        issued_by="cli",
        signing_key_id=f"{DEFAULT_KEY}:v0",
    )
    raw, sig = await sign_command(cmd_vault, DEFAULT_KEY, cmd)
    (tmp_path / COMMAND_KEYS).write_text(json.dumps(await public_key_file(cmd_vault, DEFAULT_KEY)), encoding="utf-8")

    posted: list[dict[str, Any]] = []

    def handler(req: httpx2.Request) -> httpx2.Response:
        if req.method == "GET":
            return httpx2.Response(200, json={"items": [{"command": raw, "signature": sig}]})
        posted.append(json.loads(req.content))
        return httpx2.Response(200, json={"id": cid, "status": "rejected"})

    sh_cfg = _settings(test_db, tmp_path, install_mode="self_hosted", agent_commands="on", deployment_id="dep-ct")
    app_eng = create_engine(test_db.app_url)
    try:
        res = poll_commands(app_eng, sh_cfg, now=now + timedelta(seconds=1), transport=httpx2.MockTransport(handler))
        assert res.rejected == 1 and res.done == 0
        assert posted[0]["status"] == "rejected"
    finally:
        app_eng.dispose()
        owner_eng = create_engine(test_db.owner_url)
        try:
            with owner_eng.begin() as conn:
                for tid in ("ten-new-01", "ten-mid-fail"):
                    reset_tenant(conn, tid)
        finally:
            owner_eng.dispose()
