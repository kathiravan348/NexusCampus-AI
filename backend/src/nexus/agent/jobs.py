"""Agent jobs (NEX-112): run a backup or build a diagnostic bundle and record it for the Install & updates screen.

Records are written as `nexus_app`; the backup itself reads every tenant with the owner connection. A failed backup
is recorded as `failed` and its partial file removed.
"""

import asyncio
import logging
import secrets
import sys
from collections.abc import Mapping
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from typing import Annotated, Any, Literal

import httpx2
from alembic.config import Config
from alembic.script import ScriptDirectory
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import Engine, create_engine, text

from nexus.agent.backup import write_backup
from nexus.agent.crypto import BackupCorrupt
from nexus.agent.diagnostics import build_bundle
from nexus.agent.tenant_export import (
    ENCRYPTED_COLUMNS,
    IMPORT_KEY_NAME,
    EncryptedField,
    export_header,
    pem_fingerprint,
    write_tenant_export,
)
from nexus.commands.format import CommandPayload
from nexus.core.vault import DataKey, HttpVault, Vault
from nexus.settings import BACKEND_ROOT, Settings

log = logging.getLogger("nexus.agent.jobs")


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


def backup_dir(settings: Settings) -> Path:
    return settings.backup_dir or settings.install_dir / "backups"


def diagnostics_dir(settings: Settings) -> Path:
    return settings.diagnostics_dir or settings.install_dir / "diagnostics"


def import_dir(settings: Settings) -> Path:
    return settings.import_dir or settings.install_dir / "imports"


async def _data_key(vault: Vault, name: str) -> DataKey:
    await vault.create_key(name)
    return await vault.data_key(name)


def fresh_data_key(settings: Settings, vault: Vault | None = None) -> DataKey:
    """A new 256-bit data key from Transit: plaintext for this run only, wrapped for the file header."""

    async def run() -> DataKey:
        if vault is not None:
            return await _data_key(vault, settings.backup_key_name)
        async with httpx2.AsyncClient(timeout=30) as http:
            return await _data_key(HttpVault(settings, http), settings.backup_key_name)

    return _run_async(run())  # type: ignore[no-any-return]


def run_backup(settings: Settings, vault: Vault | None = None) -> dict[str, Any]:
    started = datetime.now(UTC).replace(microsecond=0)
    app = create_engine(settings.database_url.get_secret_value())
    pending = "bkp-pending-" + started.strftime("%Y%m%d%H%M%S")
    try:
        with app.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO install_backups (id, kind, status, encrypted, started_at)"
                    " VALUES (:id, 'backup', 'running', true, :at)"
                ),
                {"id": pending, "at": started},
            )
        key = fresh_data_key(settings, vault)
        try:
            result = write_backup(
                settings.migrate_database_url.get_secret_value(),
                backup_dir(settings),
                key.plaintext,
                key.wrapped,
                settings.backup_key_name,
            )
        except Exception:
            with app.begin() as conn:
                conn.execute(
                    text("UPDATE install_backups SET status = 'failed', finished_at = now() WHERE id = :id"),
                    {"id": pending},
                )
            raise
        with app.begin() as conn:
            conn.execute(
                text(
                    "UPDATE install_backups SET id = :new, status = 'done', size_bytes = :size, finished_at = now(),"
                    " file_name = :file WHERE id = :id"
                ),
                {"new": result.id, "size": result.file_bytes, "file": result.path.name, "id": pending},
            )
            conn.execute(text("UPDATE install_status SET last_backup_at = now() WHERE id = 1"))
        return {"id": result.id, "file": str(result.path), "bytes": result.file_bytes, "tables": result.tables}
    finally:
        app.dispose()


def ensure_import_key(settings: Settings, vault: Vault | None = None) -> str:
    """Ensures the destination's RSA-4096 `tenant-import` key exists in OpenBao and returns its public PEM."""

    async def run() -> str:
        if vault is not None:
            await vault.create_import_key(IMPORT_KEY_NAME)
            return await vault.public_key_pem(IMPORT_KEY_NAME)
        async with httpx2.AsyncClient(timeout=30) as http:
            v = HttpVault(settings, http)
            await v.create_import_key(IMPORT_KEY_NAME)
            return await v.public_key_pem(IMPORT_KEY_NAME)

    return _run_async(run())  # type: ignore[no-any-return]


def run_tenant_export_pem(
    settings: Settings,
    tenant_id: str,
    dest_pem: str,
    vault: Vault | None = None,
    encrypted_columns: Mapping[tuple[str, str], EncryptedField] = ENCRYPTED_COLUMNS,
    *,
    app_engine: Engine | None = None,
) -> dict[str, Any]:
    """Exports one tenant into an `NXTE/1` file encrypted for `dest_pem` and records the job."""
    started = datetime.now(UTC).replace(microsecond=0)
    app = app_engine or create_engine(settings.database_url.get_secret_value())
    pending = "exp-pending-" + started.strftime("%Y%m%d%H%M%S") + "-" + secrets.token_hex(2)
    try:
        with app.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO install_backups (id, kind, status, encrypted, started_at)"
                    " VALUES (:id, 'tenant_export', 'running', true, :at)"
                ),
                {"id": pending, "at": started},
            )
        try:
            result = write_tenant_export(
                settings.migrate_database_url.get_secret_value(),
                backup_dir(settings),
                tenant_id,
                dest_pem,
                source_install_id=settings.install_id,
                vault=vault,
                settings=settings,
                encrypted_columns=encrypted_columns,
            )
        except Exception:
            with app.begin() as conn:
                conn.execute(
                    text("UPDATE install_backups SET status = 'failed', finished_at = now() WHERE id = :id"),
                    {"id": pending},
                )
            raise
        with app.begin() as conn:
            conn.execute(
                text(
                    "UPDATE install_backups SET id = :new, status = 'done', size_bytes = :size, finished_at = now(),"
                    " file_name = :file WHERE id = :id"
                ),
                {"new": result.id, "size": result.file_bytes, "file": result.path.name, "id": pending},
            )
        return {
            "id": result.id,
            "tenantId": result.tenant_id,
            "file": str(result.path),
            "fileName": result.path.name,
            "bytes": result.file_bytes,
            "tables": len(result.counts),
            "rows": sum(result.counts.values()),
            "counts": result.counts,
            "pemSha256": result.pem_sha256,
        }
    finally:
        if app_engine is None:
            app.dispose()


def run_tenant_export(
    settings: Settings,
    tenant_id: str,
    dest_pem_path: Path,
    vault: Vault | None = None,
    encrypted_columns: Mapping[tuple[str, str], EncryptedField] = ENCRYPTED_COLUMNS,
) -> dict[str, Any]:
    """Exports one tenant into an `NXTE/1` file encrypted for `dest_pem_path` and records the job."""
    dest_pem = dest_pem_path.read_text(encoding="utf-8")
    return run_tenant_export_pem(settings, tenant_id, dest_pem, vault=vault, encrypted_columns=encrypted_columns)


def migration_heads() -> dict[str, str]:
    heads: dict[str, str] = {}
    for name, ini in (("product", "alembic.ini"), ("control", "control_alembic.ini")):
        script = ScriptDirectory.from_config(Config(str(Path(BACKEND_ROOT) / ini)))
        heads[name] = ",".join(script.get_heads())
    return heads


def run_diagnostics(settings: Settings, ticket: str | None) -> dict[str, Any]:
    app = create_engine(settings.database_url.get_secret_value())
    try:
        with app.connect() as conn:
            row = conn.execute(text("SELECT * FROM install_status WHERE id = 1")).mappings().first()
        status = dict(row) if row else None
        bundle_id, data = build_bundle(settings, status, migration_heads(), settings.log_dir, ticket)
        folder = diagnostics_dir(settings)
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / f"{bundle_id}.json"
        path.write_bytes(data)
        with app.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO install_diagnostics"
                    " (id, status, scrubbed, size_bytes, ticket_ref, created_at, file_name)"
                    " VALUES (:id, 'ready_for_review', true, :size, :ticket, now(), :file)"
                ),
                {"id": bundle_id, "size": len(data), "ticket": ticket, "file": path.name},
            )
        return {"id": bundle_id, "file": str(path), "bytes": len(data)}
    finally:
        app.dispose()


class MoveCommandOutcome(ValueError):
    """Carries a rejected or failed machine-coded result payload back to `agent.commands`."""

    def __init__(self, status: Literal["rejected", "failed"], result: dict[str, Any]) -> None:
        super().__init__(status)
        self.status = status
        self.result = result


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)


class ImportKeyArgs(_Camel):
    pass


class ImportTenantArgs(_Camel):
    tenant_id: Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")]
    file_name: Annotated[str, StringConstraints(min_length=1, max_length=200)]
    pem_sha256: Annotated[str, StringConstraints(pattern=r"^[0-9a-f]{64}$")]
    expected_rows: Annotated[int, Field(ge=1)]


def handle_tenant_import_key(
    cmd: CommandPayload, _engine: Engine, settings: Settings, *, vault: Vault | None = None
) -> dict[str, Any]:
    """Agent handler for `tenant.import_key`: ensures `tenant-import` Transit key and returns public PEM + sha256."""
    if not settings.agent_commands_enabled:
        raise MoveCommandOutcome("rejected", {"reason": "commands_disabled"})
    try:
        ImportKeyArgs.model_validate(cmd.args)
    except ValidationError:
        raise MoveCommandOutcome("rejected", {"reason": "invalid_args"}) from None
    pem = ensure_import_key(settings, vault=vault)
    sha = pem_fingerprint(pem)
    log.info("move kind=tenant.import_key pem_sha256=%s outcome=done", sha[:12])
    return {"pem": pem, "pemSha256": sha}


def handle_tenant_import(
    cmd: CommandPayload, _engine: Engine, settings: Settings, *, vault: Vault | None = None
) -> dict[str, Any]:
    """Agent handler for `tenant.import`: validates header, runs NEX-119 import, verifies checkpoints, deletes file."""
    if not settings.agent_commands_enabled:
        raise MoveCommandOutcome("rejected", {"reason": "commands_disabled"})
    try:
        args = ImportTenantArgs.model_validate(cmd.args)
    except ValidationError:
        raise MoveCommandOutcome("rejected", {"reason": "invalid_args"}) from None
    if cmd.tenant_id and cmd.tenant_id != args.tenant_id:
        raise MoveCommandOutcome("rejected", {"reason": "invalid_args"})
    name = args.file_name
    if "/" in name or "\\" in name or name in (".", "..") or Path(name).name != name or Path(name).is_absolute():
        raise MoveCommandOutcome("rejected", {"reason": "invalid_file_name"})
    folder = import_dir(settings).resolve()
    target = (folder / name).resolve()
    if target.parent != folder:
        raise MoveCommandOutcome("rejected", {"reason": "invalid_file_name"})
    if not target.is_file():
        raise MoveCommandOutcome("failed", {"reason": "file_not_found"})
    try:
        header = export_header(target)
    except (OSError, BackupCorrupt):
        raise MoveCommandOutcome("rejected", {"reason": "corrupt_file"}) from None
    if header.fields.get("tenantId") != args.tenant_id:
        raise MoveCommandOutcome("rejected", {"reason": "tenant_mismatch"})
    if header.fields.get("pemSha256") != args.pem_sha256:
        raise MoveCommandOutcome("rejected", {"reason": "fingerprint_mismatch"})
    raw_tables = header.fields.get("tables")
    header_rows = sum(raw_tables.values()) if isinstance(raw_tables, dict) else 0
    if header_rows != args.expected_rows:
        raise MoveCommandOutcome("rejected", {"reason": "row_count_mismatch"})
    from nexus.agent.tenant_import import TenantImportRefused, run_tenant_import, verify_imported_tenant

    try:
        imported = run_tenant_import(settings, target, vault=vault)
    except (TenantImportRefused, BackupCorrupt):
        raise MoveCommandOutcome("failed", {"reason": "import_refused"}) from None
    chain_ok, cp_ok = verify_imported_tenant(
        settings.database_url.get_secret_value(), args.tenant_id, vault=vault, settings=settings
    )
    target.unlink(missing_ok=True)
    log.info(
        "move kind=tenant.import tenant=%s rows=%d skipped=%d chain=%s checkpoint=%s outcome=done",
        args.tenant_id,
        imported.rows_loaded,
        imported.skipped_checkpoints,
        chain_ok,
        cp_ok,
    )
    return {
        "tenantId": args.tenant_id,
        "rows": imported.rows_loaded,
        "checkpointsSkipped": imported.skipped_checkpoints,
        "chainOk": chain_ok,
        "checkpointOk": cp_ok,
    }
