"""Tenant freeze guard and cell-side P04 offboarding command handlers (D61, NEX-133)."""

import asyncio
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

import httpx2
from pydantic import BaseModel, ConfigDict, StringConstraints, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import Engine, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from nexus.agent.crypto import BackupCorrupt
from nexus.agent.jobs import backup_dir, run_tenant_export_pem
from nexus.agent.tenant_export import export_header, load_rsa_public_key
from nexus.commands.format import CommandPayload
from nexus.core.errors import ApiError
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.hashchain import format_instant
from nexus.core.vault import HttpVault, Vault
from nexus.settings import Settings

log = logging.getLogger("nexus.offboarding")

EntityId = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")]
Sha256Hex = Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
StaffRef = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=128)]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)


class FreezeTenantArgs(_Camel):
    tenant_id: EntityId


class ExportTenantArgs(_Camel):
    tenant_id: EntityId
    recipient_pem: Annotated[str, StringConstraints(strip_whitespace=True, min_length=64, max_length=1900)]


class DestroyKeysArgs(_Camel):
    tenant_id: EntityId
    export_pem_sha256: Sha256Hex
    approved_by: list[StaffRef]


class OffboardingCommandOutcome(ValueError):
    """Carries a rejected or failed machine-coded result payload back to `agent.commands`."""

    def __init__(self, status: Literal["rejected", "failed"], result: dict[str, Any]) -> None:
        super().__init__(status)
        self.status = status
        self.result = result


async def is_tenant_frozen(session: AsyncSession, tenant_id: str) -> bool:
    """True when `tenants.frozen_at` is set for the bound tenant."""
    frozen_at = (
        await session.execute(text("SELECT frozen_at FROM tenants WHERE id = :id"), {"id": tenant_id})
    ).scalar_one_or_none()
    return frozen_at is not None


async def ensure_not_frozen(session: AsyncSession, tenant_id: str) -> None:
    """Shared write guard (NEX-133): refuses writes to a frozen tenant with `423 tenant_frozen`."""
    if await is_tenant_frozen(session, tenant_id):
        raise ApiError(423, "tenant_frozen", "This institution is frozen and cannot be modified.")


def _run_async(coro: Any) -> Any:
    def _runner() -> Any:
        if sys.platform == "win32":
            return asyncio.run(coro, loop_factory=asyncio.SelectorEventLoop)
        return asyncio.run(coro)

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return _runner()
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(_runner).result()


def _require_saas_and_tenant(cmd: CommandPayload, settings: Settings, tenant_id: str) -> None:
    if settings.install_mode != "saas":
        raise OffboardingCommandOutcome("rejected", {"reason": "self_hosted_not_allowed"})
    if cmd.tenant_id and cmd.tenant_id != tenant_id:
        raise OffboardingCommandOutcome("rejected", {"reason": "invalid_args"})


async def _freeze_in_db(settings: Settings, tenant_id: str) -> datetime:
    from nexus.core.audit import AuditInput, changes, record_audit
    from nexus.core.tenancy import TenantContext, bind_tenant

    eng = create_async_engine(settings.migrate_database_url.get_secret_value())
    maker = async_sessionmaker(eng, expire_on_commit=False)
    try:
        ctx = TenantContext(tenant_id)
        async with maker() as session, session.begin():
            await bind_tenant(session, ctx)
            row = (
                await session.execute(
                    text("SELECT frozen_at FROM tenants WHERE id = :id FOR UPDATE"), {"id": tenant_id}
                )
            ).first()
            if row is None:
                raise OffboardingCommandOutcome("failed", {"reason": "unknown_tenant"})
            if row.frozen_at is not None:
                return row.frozen_at  # type: ignore[no-any-return]
            now = datetime.now(UTC)
            await session.execute(
                text("UPDATE tenants SET frozen_at = :now, updated_at = :now WHERE id = :id"),
                {"now": now, "id": tenant_id},
            )
            await record_audit(
                session,
                ctx,
                AuditInput(
                    action="m01.tenant.frozen",
                    actor_kind="system",
                    target_type="tenant",
                    target_id=tenant_id,
                    changes=changes("frozenAt"),
                ),
            )
            return now
    finally:
        await eng.dispose()


async def _tenant_freeze_state(settings: Settings, tenant_id: str) -> tuple[bool, bool]:
    """Returns `(exists, is_frozen)` using the owner connection."""
    from nexus.core.tenancy import TenantContext, bind_tenant

    eng = create_async_engine(settings.migrate_database_url.get_secret_value())
    maker = async_sessionmaker(eng, expire_on_commit=False)
    try:
        async with maker() as session, session.begin():
            await bind_tenant(session, TenantContext(tenant_id))
            row = (
                await session.execute(text("SELECT frozen_at FROM tenants WHERE id = :id"), {"id": tenant_id})
            ).first()
            if row is None:
                return False, False
            return True, row.frozen_at is not None
    finally:
        await eng.dispose()


def latest_tenant_export_fingerprint(engine: Engine, settings: Settings, tenant_id: str) -> str | None:
    """Returns the `pemSha256` of the tenant's most recent on-disk `NXTE/1` export, or None."""
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT file_name FROM install_backups "
                "WHERE kind = 'tenant_export' AND status = 'done' AND file_name IS NOT NULL "
                "ORDER BY finished_at DESC, started_at DESC"
            )
        ).scalars()
        files = list(rows)
    folder = backup_dir(settings)
    for name in files:
        path = folder / str(name)
        if not path.is_file():
            continue
        try:
            header = export_header(path)
        except (OSError, BackupCorrupt):
            continue
        if header.fields.get("tenantId") == tenant_id:
            sha = header.fields.get("pemSha256")
            return str(sha) if isinstance(sha, str) else None
    return None


async def _destroy_keys_in_db(settings: Settings, tenant_id: str, vault: Vault | None) -> tuple[list[str], datetime]:
    from nexus.core.tenancy import TenantContext, bind_tenant
    from nexus.modules.m83.keys import destroy_tenant_keys

    # Run as `nexus_app` (RLS enforced, non-superuser) + explicit tenant filter so other tenants' keys stay untouchable.
    eng = create_async_engine(settings.database_url.get_secret_value())
    maker = async_sessionmaker(eng, expire_on_commit=False)
    try:
        ctx = TenantContext(tenant_id)

        async def _run_with(v: Vault) -> tuple[list[str], datetime]:
            cipher = FieldCipher(v)
            async with maker() as session, session.begin():
                await bind_tenant(session, ctx)
                await destroy_tenant_keys(session, ctx, v, cipher)
                q = "SELECT id FROM vault_keys WHERE tenant_id = :t AND status = 'destroyed' ORDER BY created_at, id"
                key_ids = list((await session.execute(text(q), {"t": tenant_id})).scalars())
                return [str(k) for k in key_ids], datetime.now(UTC)

        if vault is not None:
            return await _run_with(vault)
        async with httpx2.AsyncClient(timeout=20) as http:
            return await _run_with(HttpVault(settings, http))
    finally:
        await eng.dispose()


def handle_tenant_freeze(cmd: CommandPayload, _engine: Engine, settings: Settings) -> dict[str, Any]:
    """Agent handler for `tenant.freeze`: freezes writes once (idempotent) and audits `m01.tenant.frozen`."""
    if settings.install_mode != "saas":
        raise OffboardingCommandOutcome("rejected", {"reason": "self_hosted_not_allowed"})
    try:
        args = FreezeTenantArgs.model_validate(cmd.args)
    except ValidationError:
        raise OffboardingCommandOutcome("rejected", {"reason": "invalid_args"}) from None
    _require_saas_and_tenant(cmd, settings, args.tenant_id)
    frozen_at: datetime = _run_async(_freeze_in_db(settings, args.tenant_id))
    log.info("offboard kind=tenant.freeze tenant=%s outcome=done", args.tenant_id)
    return {"tenantId": args.tenant_id, "frozenAt": format_instant(frozen_at)}


def handle_tenant_export(
    cmd: CommandPayload,
    engine: Engine,
    settings: Settings,
    *,
    vault: Vault | None = None,
) -> dict[str, Any]:
    """Agent handler for `tenant.export`: exports a frozen tenant into local `NXTE/1` for the institution's PEM."""
    if settings.install_mode != "saas":
        raise OffboardingCommandOutcome("rejected", {"reason": "self_hosted_not_allowed"})
    try:
        args = ExportTenantArgs.model_validate(cmd.args)
    except ValidationError:
        raise OffboardingCommandOutcome("rejected", {"reason": "invalid_args"}) from None
    _require_saas_and_tenant(cmd, settings, args.tenant_id)
    try:
        load_rsa_public_key(args.recipient_pem)
    except ValueError:
        raise OffboardingCommandOutcome("rejected", {"reason": "invalid_recipient_key"}) from None
    exists, frozen = _run_async(_tenant_freeze_state(settings, args.tenant_id))
    if not exists:
        raise OffboardingCommandOutcome("failed", {"reason": "unknown_tenant"})
    if not frozen:
        raise OffboardingCommandOutcome("failed", {"reason": "not_frozen"})
    exported = run_tenant_export_pem(settings, args.tenant_id, args.recipient_pem, vault=vault, app_engine=engine)
    log.info(
        "offboard kind=tenant.export tenant=%s tables=%d rows=%d outcome=done",
        args.tenant_id,
        exported["tables"],
        exported["rows"],
    )
    return {
        "fileName": exported["fileName"],
        "bytes": exported["bytes"],
        "pemSha256": exported["pemSha256"],
        "tables": exported["tables"],
        "rows": exported["rows"],
    }


def handle_tenant_destroy_keys(
    cmd: CommandPayload,
    engine: Engine,
    settings: Settings,
    *,
    vault: Vault | None = None,
) -> dict[str, Any]:
    """Agent handler for `tenant.destroy_keys`: four-eyes + frozen + matching export fingerprint → crypto-shred."""
    if settings.install_mode != "saas":
        raise OffboardingCommandOutcome("rejected", {"reason": "self_hosted_not_allowed"})
    try:
        args = DestroyKeysArgs.model_validate(cmd.args)
    except ValidationError:
        raise OffboardingCommandOutcome("rejected", {"reason": "invalid_args"}) from None
    _require_saas_and_tenant(cmd, settings, args.tenant_id)
    distinct = list(dict.fromkeys(args.approved_by))
    if len(args.approved_by) != 2 or len(distinct) != 2:
        raise OffboardingCommandOutcome("rejected", {"reason": "two_approvers_required"})
    exists, frozen = _run_async(_tenant_freeze_state(settings, args.tenant_id))
    if not exists:
        raise OffboardingCommandOutcome("failed", {"reason": "unknown_tenant"})
    if not frozen:
        raise OffboardingCommandOutcome("failed", {"reason": "not_frozen"})
    latest_sha = latest_tenant_export_fingerprint(engine, settings, args.tenant_id)
    if latest_sha != args.export_pem_sha256:
        raise OffboardingCommandOutcome("failed", {"reason": "no_export"})
    key_ids, destroyed_at = _run_async(_destroy_keys_in_db(settings, args.tenant_id, vault))
    log.info("offboard kind=tenant.destroy_keys tenant=%s keys=%d outcome=done", args.tenant_id, len(key_ids))
    return {"keyIds": key_ids, "destroyedAt": format_instant(destroyed_at)}
