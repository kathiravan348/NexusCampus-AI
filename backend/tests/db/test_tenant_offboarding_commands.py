"""DB tests for cell-side P04 offboarding commands (`tenant.freeze`, `tenant.export`, `tenant.destroy_keys`)."""

import json
import logging
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx2
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from nexus.agent.commands import COMMAND_KEYS, HANDLERS, poll_commands
from nexus.agent.jobs import backup_dir
from nexus.agent.tenant_export import export_header, pem_fingerprint
from nexus.commands.format import DEFAULT_KEY, CommandPayload, new_command_id, public_key_file, sign_command
from nexus.core.errors import ApiError
from nexus.core.fieldcrypto import FieldCipher, FieldUnreadable
from nexus.core.freeze import (
    handle_tenant_destroy_keys,
    handle_tenant_export,
    handle_tenant_freeze,
)
from nexus.core.hashchain import verify_chain
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.core.vault import FakeVault, key_name
from nexus.modules.m02.keycloak_admin import FakeKeycloakAdmin
from nexus.provisioning.tenant import ProvisionOwner, ProvisionTenantArgs, provision_tenant
from nexus.seed.demo import reset_tenant
from nexus.settings import Settings
from nexus.workers.outbox import process_tenant
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m83.helpers import csrf
from tests.fake_keycloak import FakeKeycloak

OWNER_EMAIL = "owner@offboard-test.example.edu"
OWNER_NAME = "Kavitha Subramanian"
TENANT_ID = "ten-off-01"


def _rsa_pem(bits: int) -> str:
    priv = rsa.generate_private_key(public_exponent=65537, key_size=bits)
    return priv.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo).decode("ascii")


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


def _settings(db: DbUrls, tmp_path: Path, **overrides: Any) -> Settings:
    data: dict[str, Any] = {
        "install_mode": "saas",
        "region": "in",
        "deployment_id": "dep-in-1",
        "install_dir": tmp_path,
        "control_url": "https://control.nexuscampus.example",
        "control_agent_token": SecretStr("tok-offboard-test"),
        "database_url": SecretStr(db.app_url),
        "migrate_database_url": SecretStr(db.owner_url),
    }
    data.update(overrides)
    return Settings(**data)


async def _sign_one(
    vault: FakeVault, kind: str, args: dict[str, Any], tenant_id: str | None = TENANT_ID
) -> dict[str, str]:
    now = datetime.now(UTC)
    payload = CommandPayload(
        id=new_command_id(),
        deployment_id="dep-in-1",
        tenant_id=tenant_id,
        kind=kind,
        args=args,
        issued_at=now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        expires_at=(now + timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        issued_by="stf-0001",
        signing_key_id="placeholder",
    )
    raw, sig = await sign_command(vault, DEFAULT_KEY, payload)
    return {"id": payload.id, "command": raw, "signature": sig}


def _poll_one(
    app_eng: Any,
    cfg: Settings,
    item: dict[str, str],
    vault: FakeVault,
) -> tuple[Any, list[dict[str, Any]]]:
    reports: list[dict[str, Any]] = []

    def handler(req: httpx2.Request) -> httpx2.Response:
        if req.method == "GET" and req.url.path.endswith("/agent/commands"):
            return httpx2.Response(200, json={"items": [{"command": item["command"], "signature": item["signature"]}]})
        if req.method == "POST" and req.url.path.endswith("/result"):
            reports.append(json.loads(req.content.decode("utf-8")))
            return httpx2.Response(200, json={"ok": True})
        return httpx2.Response(404)

    custom_handlers = {
        **HANDLERS,
        "tenant.freeze": handle_tenant_freeze,
        "tenant.export": lambda c, e, s: handle_tenant_export(c, e, s, vault=vault),
        "tenant.destroy_keys": lambda c, e, s: handle_tenant_destroy_keys(c, e, s, vault=vault),
    }
    res = poll_commands(app_eng, cfg, transport=httpx2.MockTransport(handler), handlers=custom_handlers)
    return res, reports


def _cleanup_tenant(owner_url: str, tenant_id: str) -> None:
    eng = create_engine(owner_url)
    try:
        with eng.begin() as conn:
            reset_tenant(conn, tenant_id)
            conn.execute(text("DELETE FROM agent_commands"))
            conn.execute(text("DELETE FROM install_backups WHERE kind = 'tenant_export'"))
    finally:
        eng.dispose()


@pytest.mark.anyio
async def test_offboarding_freeze_export_destroy_end_to_end(
    test_db: DbUrls,
    client: TestClient,
    kc: FakeKeycloak,
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    _seed_plan(test_db.owner_url)
    cfg = _settings(test_db, tmp_path)
    vault = FakeVault()
    kc_admin = FakeKeycloakAdmin()

    owner_eng = create_engine(test_db.owner_url)
    app_eng = create_engine(test_db.app_url)
    try:
        prov = await provision_tenant(
            cfg,
            vault,
            kc_admin,
            ProvisionTenantArgs.model_validate(
                {
                    "tenantId": TENANT_ID,
                    "name": "Offboard Test School",
                    "institutionType": "k12",
                    "region": "in",
                    "planCode": "standard",
                    "owner": ProvisionOwner(legal_name=OWNER_NAME, work_email=OWNER_EMAIL),
                }
            ),
        )
        assert prov.failed_step is None and len(prov.steps_done) == 5

        # Activate owner user so we can sign in and test API reads & writes
        with owner_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": TENANT_ID})
            conn.execute(
                text("UPDATE users SET status = 'active', idp_subject = 'kc-off-owner' WHERE lower(email) = :e"),
                {"e": OWNER_EMAIL},
            )

        # Encrypt a sample value with the tenant's data key before crypto-shredding
        cipher = FieldCipher(vault)
        tk_name = key_name(TENANT_ID, "tenant_data")
        sealed = await cipher.encrypt(tk_name, "person.nationalId", "IND-9999-8888")
        assert await cipher.decrypt(tk_name, "person.nationalId", sealed) == "IND-9999-8888"

        # Pin command signing public key
        await vault.create_signing_key(DEFAULT_KEY)
        (tmp_path / COMMAND_KEYS).write_text(json.dumps(await public_key_file(vault, DEFAULT_KEY)), encoding="utf-8")

        # App role cannot set or clear frozen_at
        with pytest.raises(ProgrammingError), app_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": TENANT_ID})
            conn.execute(text("UPDATE tenants SET frozen_at = now() WHERE id = :t"), {"t": TENANT_ID})

        # Sign in as tenant owner
        sign_in(client, kc, email=OWNER_EMAIL, sub="kc-off-owner", organization=[TENANT_ID])

        # Export refused before freeze
        recipient_pem = _rsa_pem(3072)
        exp_before = await _sign_one(vault, "tenant.export", {"tenantId": TENANT_ID, "recipientPem": recipient_pem})
        _, reports = _poll_one(app_eng, cfg, exp_before, vault)
        assert reports[0] == {"status": "failed", "result": {"reason": "not_frozen"}}

        # Weak RSA key (< 3072 bits) rejected
        weak_pem = _rsa_pem(2048)
        exp_weak = await _sign_one(vault, "tenant.export", {"tenantId": TENANT_ID, "recipientPem": weak_pem})
        _, reports = _poll_one(app_eng, cfg, exp_weak, vault)
        assert reports[0] == {"status": "rejected", "result": {"reason": "invalid_recipient_key"}}

        # Freeze the tenant
        with caplog.at_level(logging.INFO, logger="nexus.offboarding"):
            freeze_cmd = await _sign_one(vault, "tenant.freeze", {"tenantId": TENANT_ID})
            res, reports = _poll_one(app_eng, cfg, freeze_cmd, vault)
        assert res.done == 1 and reports[0]["status"] == "done"
        frozen_at = reports[0]["result"]["frozenAt"]
        assert reports[0]["result"]["tenantId"] == TENANT_ID

        # Replay of the exact same command id is skipped (not run twice)
        res_replay, reports_replay = _poll_one(app_eng, cfg, freeze_cmd, vault)
        assert res_replay.skipped == 1 and res_replay.done == 0 and reports_replay == []

        # Second freeze command with new id is a no-op (same frozenAt, 1 audit event)
        freeze_cmd2 = await _sign_one(vault, "tenant.freeze", {"tenantId": TENANT_ID})
        res2, reports2 = _poll_one(app_eng, cfg, freeze_cmd2, vault)
        assert res2.done == 1 and reports2[0]["result"]["frozenAt"] == frozen_at
        with owner_eng.begin() as conn:
            conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": TENANT_ID})
            freeze_audits = conn.execute(
                text("SELECT count(*) FROM audit_events WHERE action = 'm01.tenant.frozen'")
            ).scalar_one()
        assert freeze_audits == 1

        # Sampled API writes across M01, M02, M06, M07 all return 423 tenant_frozen
        inst_id = f"ins-{TENANT_ID}"
        headers = csrf(client)
        r_m01 = client.put(
            f"/api/v1/locale-settings?institutionId={inst_id}",
            json={
                "defaultLocale": "en-IN",
                "supportedLocales": ["en-IN"],
                "timeZone": "Asia/Kolkata",
                "currency": "INR",
                "country": "IN",
                "weekendDays": [0],
            },
            headers=headers,
        )
        r_m02 = client.post(
            "/api/v1/roles",
            json={"name": "Blocked Role", "permissions": ["m01.institution.read"], "allowedScopeKinds": ["campus"]},
            headers=headers,
        )
        r_m06 = client.patch(
            "/api/v1/data-requests/dsr-any",
            json={"status": "in_progress"},
            headers=headers,
        )
        r_m07 = client.put(
            "/api/v1/notification-preferences",
            json={"channels": [{"channel": "in_app", "enabled": True}], "quietHours": None},
            headers=headers,
        )
        for resp in (r_m01, r_m02, r_m06, r_m07):
            assert resp.status_code == 423, resp.text
            assert resp.json()["error"]["code"] == "tenant_frozen"

        # Reads across M01, M02, M06, M07 still return 200
        for path in ("/api/v1/tenant", "/api/v1/users", "/api/v1/audit-events", "/api/v1/notification-preferences"):
            resp = client.get(path)
            assert resp.status_code == 200, (path, resp.status_code)

        # Outbox worker write guard also refuses the frozen tenant with 423 tenant_frozen
        async_eng = create_async_engine(test_db.app_url)
        try:
            maker = async_sessionmaker(async_eng, expire_on_commit=False)
            with pytest.raises(ApiError) as exc_info:
                await process_tenant(maker, cfg, TENANT_ID, lambda _s, _e: _noop())
            assert exc_info.value.status == 423 and exc_info.value.code == "tenant_frozen"
        finally:
            await async_eng.dispose()

        # Destroy keys refused before export
        expected_sha = pem_fingerprint(recipient_pem)
        dest_no_exp = await _sign_one(
            vault,
            "tenant.destroy_keys",
            {"tenantId": TENANT_ID, "exportPemSha256": expected_sha, "approvedBy": ["stf-0001", "stf-0002"]},
        )
        _, reports = _poll_one(app_eng, cfg, dest_no_exp, vault)
        assert reports[0] == {"status": "failed", "result": {"reason": "no_export"}}

        # Export succeeds after freeze; header counts match reported result
        with caplog.at_level(logging.INFO, logger="nexus.offboarding"):
            exp_cmd = await _sign_one(vault, "tenant.export", {"tenantId": TENANT_ID, "recipientPem": recipient_pem})
            res_exp, reports_exp = _poll_one(app_eng, cfg, exp_cmd, vault)
        assert res_exp.done == 1 and reports_exp[0]["status"] == "done"
        exp_result = reports_exp[0]["result"]
        assert set(exp_result) == {"fileName", "bytes", "pemSha256", "tables", "rows"}
        assert exp_result["pemSha256"] == expected_sha
        exp_path = backup_dir(cfg) / exp_result["fileName"]
        assert exp_path.is_file()
        header = export_header(exp_path)
        assert header.fields["tenantId"] == TENANT_ID
        assert header.fields["pemSha256"] == expected_sha
        assert len(header.fields["tables"]) == exp_result["tables"]
        assert sum(header.fields["tables"].values()) == exp_result["rows"]

        # Destroy keys rejected with single or duplicate approver
        for bad_approvers in (["stf-0001"], ["stf-0001", "stf-0001"]):
            bad_cmd = await _sign_one(
                vault,
                "tenant.destroy_keys",
                {"tenantId": TENANT_ID, "exportPemSha256": expected_sha, "approvedBy": bad_approvers},
            )
            _, rep = _poll_one(app_eng, cfg, bad_cmd, vault)
            assert rep[0] == {"status": "rejected", "result": {"reason": "two_approvers_required"}}

        # Destroy keys fails with mismatched fingerprint
        wrong_sha = "0" * 64
        bad_sha_cmd = await _sign_one(
            vault,
            "tenant.destroy_keys",
            {"tenantId": TENANT_ID, "exportPemSha256": wrong_sha, "approvedBy": ["stf-0001", "stf-0002"]},
        )
        _, rep = _poll_one(app_eng, cfg, bad_sha_cmd, vault)
        assert rep[0] == {"status": "failed", "result": {"reason": "no_export"}}

        # Destroy keys succeeds with two distinct approvers and matching fingerprint
        with caplog.at_level(logging.INFO, logger="nexus.offboarding"):
            dest_cmd = await _sign_one(
                vault,
                "tenant.destroy_keys",
                {"tenantId": TENANT_ID, "exportPemSha256": expected_sha, "approvedBy": ["stf-0001", "stf-0002"]},
            )
            res_dest, reports_dest = _poll_one(app_eng, cfg, dest_cmd, vault)
        assert res_dest.done == 1 and reports_dest[0]["status"] == "done"
        dest_result = reports_dest[0]["result"]
        assert set(dest_result) == {"keyIds", "destroyedAt"}
        assert len(dest_result["keyIds"]) == 1

        # Field-encrypted value is now unreadable
        cipher.forget(tk_name)
        with pytest.raises(FieldUnreadable):
            await cipher.decrypt(tk_name, "person.nationalId", sealed)

        # Audit chain still verifies intact
        async_owner = create_async_engine(test_db.owner_url)
        try:
            maker = async_sessionmaker(async_owner, expire_on_commit=False)
            async with maker() as s, s.begin():
                await bind_tenant(s, TenantContext(TENANT_ID))
                check = await verify_chain(s, TENANT_ID)
                assert check.ok is True and check.checked >= 7
        finally:
            await async_owner.dispose()

        # Self-hosted installs reject all three commands even when commands are switched on
        sh_cfg = _settings(test_db, tmp_path, install_mode="self_hosted", agent_commands="on")
        for kind, args in (
            ("tenant.freeze", {"tenantId": TENANT_ID}),
            ("tenant.export", {"tenantId": TENANT_ID, "recipientPem": recipient_pem}),
            (
                "tenant.destroy_keys",
                {"tenantId": TENANT_ID, "exportPemSha256": expected_sha, "approvedBy": ["stf-1", "stf-2"]},
            ),
        ):
            sh_cmd = await _sign_one(vault, kind, args)
            _, rep = _poll_one(app_eng, sh_cfg, sh_cmd, vault)
            assert rep[0] == {"status": "rejected", "result": {"reason": "self_hosted_not_allowed"}}

        # Neither command outputs nor logs carry personal data
        combined = (
            json.dumps([reports2, reports_exp, reports_dest]) + "\n" + "\n".join(r.getMessage() for r in caplog.records)
        )
        assert OWNER_NAME not in combined and OWNER_EMAIL not in combined
    finally:
        owner_eng.dispose()
        app_eng.dispose()
        _cleanup_tenant(test_db.owner_url, TENANT_ID)


async def _noop() -> int:
    return 0
