"""Tenant import `NXTE/1` (DM-8, D58, D59, NEX-119): load one exported institution into an empty tenant.

Refuses before reading rows on format, `pemSha256`, revision, existing tenant, or table-list errors. Streams rows
(skipping source `audit_checkpoints`) inside one owner transaction with `session_replication_role = replica` using
explicit `information_schema` casts/adapters, committing only after the final chunk verifies and counts match. Then
creates destination OpenBao keys, re-encrypts `decryptedColumns`, records `m84.tenant.imported`, and signs a checkpoint.
"""

import asyncio
import base64
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx2
import psycopg
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from psycopg import sql
from psycopg.types.json import Json, Jsonb
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from nexus.agent.backup import libpq_url
from nexus.agent.crypto import Header, read_header
from nexus.agent.tenant_export import (
    ENCRYPTED_COLUMNS,
    FORMAT,
    IMPORT_KEY_NAME,
    NOT_EXPORTED,
    TENANTS_TABLE,
    EncryptedField,
    decrypt_export_rows,
    pem_fingerprint,
    tenant_tables_and_revision,
    unwrap_export_key,
)
from nexus.core.audit import AuditInput, record_audit
from nexus.core.checkpoints import CHECKPOINT_KEY, create_checkpoint
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.core.vault import FakeVault, HttpVault, KeyDestroyed, Vault, key_name
from nexus.settings import Settings

CHECKPOINTS_TABLE, VAULT_KEYS_TABLE, ALLOWED_CUSTODY = "audit_checkpoints", "vault_keys", "platform"


class TenantImportRefused(ValueError):
    """Export cannot be imported into this install (message names ids and revisions only)."""


@dataclass(frozen=True)
class ImportResult:
    tenant_id: str
    counts: dict[str, int]
    rows_loaded: int
    skipped_checkpoints: int
    keys_created: list[str]
    checkpoint_id: str | None


async def _import_key_fingerprints(vault: Vault, name: str = IMPORT_KEY_NAME) -> set[str]:
    if isinstance(vault, FakeVault):
        return {
            pem_fingerprint(k.public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo))
            for k in vault.rsa.get(name, ())
        }
    try:
        if isinstance(vault, HttpVault):
            keys, _ = await vault._key_versions(name)
            return {pem_fingerprint(str(k["public_key"])) for k in keys.values()}  # type: ignore[index]
        return {pem_fingerprint(await vault.public_key_pem(name))}
    except KeyDestroyed:
        return set()


def _column_types(conn: psycopg.Connection) -> dict[str, dict[str, tuple[str, str]]]:
    q = (
        "SELECT table_name, column_name, data_type, udt_name "
        "FROM information_schema.columns WHERE table_schema = 'public'"
    )
    out: dict[str, dict[str, tuple[str, str]]] = {}
    for tbl, col, dtype, udt in conn.execute(q).fetchall():
        out.setdefault(str(tbl), {})[str(col)] = (str(dtype), str(udt))
    return out


def _validate_header(
    header: Header, fingerprints: set[str], allowed_tables: set[str], db_revision: str, conn: psycopg.Connection
) -> tuple[str, dict[str, int]]:
    fields = header.fields
    if fields.get("format") != FORMAT:
        raise TenantImportRefused(f"unsupported export format {fields.get('format')!r}")
    pem_sha = str(fields.get("pemSha256") or "")
    if not pem_sha or pem_sha not in fingerprints:
        raise TenantImportRefused("file was not encrypted for this install's tenant-import key")
    file_rev = str(fields.get("revision") or "")
    if file_rev != db_revision:
        raise TenantImportRefused(f"schema revision mismatch: file is {file_rev}, database is {db_revision}")
    tenant_id = str(fields.get("tenantId") or "").strip()
    if not tenant_id:
        raise TenantImportRefused("export header has no tenantId")
    if conn.execute("SELECT 1 FROM tenants WHERE id = %s", (tenant_id,)).fetchone() is not None:
        raise TenantImportRefused(f"tenant {tenant_id} already exists in this database")
    raw_tables = fields.get("tables")
    if not isinstance(raw_tables, dict) or not raw_tables:
        raise TenantImportRefused("export header has no table counts")
    counts: dict[str, int] = {}
    for tbl, cnt in raw_tables.items():
        if not isinstance(tbl, str) or isinstance(cnt, bool) or not isinstance(cnt, int) or cnt < 0:
            raise TenantImportRefused(f"invalid table count entry for {tbl!r}")
        if tbl in NOT_EXPORTED:
            raise TenantImportRefused(f"table {tbl} is in NOT_EXPORTED and cannot be imported")
        if tbl not in allowed_tables:
            raise TenantImportRefused(f"table {tbl} does not exist as a tenant table in this database")
        counts[tbl] = cnt
    if counts.get(TENANTS_TABLE) != 1:
        raise TenantImportRefused(f"export must contain exactly 1 tenants row (got {counts.get(TENANTS_TABLE)})")
    return tenant_id, counts


def _adapt_value(value: Any, udt_name: str) -> Any:
    if value is None:
        return None
    if udt_name == "jsonb":
        return Jsonb(value)
    if udt_name == "json":
        return Json(value)
    if udt_name == "bytea" and isinstance(value, str):
        return base64.b64decode(value)
    return value


def _insert_sql(table: str, cols: list[str], types: dict[str, tuple[str, str]]) -> sql.Composed:
    ph = [sql.SQL("%s::vector") if types[c][1] == "vector" else sql.SQL("%s") for c in cols]
    return sql.SQL("INSERT INTO {} ({}) VALUES ({})").format(
        sql.Identifier(table), sql.SQL(", ").join(sql.Identifier(c) for c in cols), sql.SQL(", ").join(ph)
    )


def _decrypted_specs(
    header: Header,
    col_types: dict[str, dict[str, tuple[str, str]]],
    allowed: set[str],
    extra: Mapping[tuple[str, str], EncryptedField],
) -> list[tuple[str, str, str, str]]:
    specs = {(t, c): (s.purpose, s.field) for (t, c), s in extra.items()}
    raw_list = header.fields.get("decryptedColumns") or []
    if not isinstance(raw_list, list):
        raise TenantImportRefused("invalid decryptedColumns in header")
    for entry in raw_list:
        if not isinstance(entry, dict):
            raise TenantImportRefused("invalid decryptedColumns entry")
        tbl, col = str(entry.get("table") or ""), str(entry.get("column") or "")
        purpose, field = str(entry.get("purpose") or ""), str(entry.get("field") or "")
        if tbl not in allowed or col not in col_types.get(tbl, {}) or not purpose or not field:
            raise TenantImportRefused(f"invalid decrypted column {tbl}.{col}")
        specs[(tbl, col)] = (purpose, field)
    return [(t, c, p, f) for (t, c), (p, f) in sorted(specs.items())]


async def _reencrypt_columns(
    owner_url: str, vault: Vault, tenant_id: str, dec_specs: list[tuple[str, str, str, str]]
) -> None:
    cipher = FieldCipher(vault)
    with psycopg.connect(libpq_url(owner_url)) as conn:
        for table, col, purpose, field in dec_specs:
            fcol = sql.Identifier("id" if table == TENANTS_TABLE else "tenant_id")
            sel = sql.SQL("SELECT ctid, {} FROM {} WHERE {} = %s AND {} IS NOT NULL").format(
                sql.Identifier(col), sql.Identifier(table), fcol, sql.Identifier(col)
            )
            upd = sql.SQL("UPDATE {} SET {} = %s WHERE ctid = %s").format(sql.Identifier(table), sql.Identifier(col))
            kname = key_name(tenant_id, purpose)
            for ctid, plain in conn.execute(sel, (tenant_id,)).fetchall():
                if isinstance(plain, str):
                    conn.execute(upd, (await cipher.encrypt(kname, field, plain), ctid))


async def _post_import_audit(app_url: str, vault: Vault, tenant_id: str) -> str | None:
    engine = create_async_engine(app_url)
    try:
        sessions = async_sessionmaker(engine, expire_on_commit=False)
        await vault.create_signing_key(CHECKPOINT_KEY)
        ctx = TenantContext(tenant_id)
        async with sessions() as session, session.begin():
            await bind_tenant(session, ctx)
            ev = AuditInput(
                action="m84.tenant.imported", actor_kind="system", target_type="tenant", target_id=tenant_id
            )
            await record_audit(session, ctx, ev)
            cp, _ = await create_checkpoint(session, vault, ctx, datetime.now(UTC).date())
        return cp.id if cp else None
    finally:
        await engine.dispose()


async def _run_import(
    path: Path,
    owner_url: str,
    app_url: str,
    vault: Vault,
    encrypted_columns: Mapping[tuple[str, str], EncryptedField],
) -> ImportResult:
    fingerprints = await _import_key_fingerprints(vault, IMPORT_KEY_NAME)
    with path.open("rb") as src:
        header = read_header(src)
        with psycopg.connect(libpq_url(owner_url)) as conn:
            tables, db_rev = tenant_tables_and_revision(conn)
            allowed, col_types = set(tables), _column_types(conn)
            tenant_id, expected = _validate_header(header, fingerprints, allowed, db_rev, conn)
            dec_specs = _decrypted_specs(header, col_types, allowed, encrypted_columns)

            data_key = await unwrap_export_key(vault, header, IMPORT_KEY_NAME)
            conn.execute("SET session_replication_role = replica")
            seen: dict[str, int] = dict.fromkeys(expected, 0)
            loaded, skipped_cp = 0, 0
            key_purposes: set[str] = set()
            stmt_cache: dict[tuple[str, tuple[str, ...]], sql.Composed] = {}

            for table, row in decrypt_export_rows(src, data_key, header):
                if table not in expected:
                    raise TenantImportRefused(f"unexpected table {table} in stream")
                row_tid = row.get("id") if table == TENANTS_TABLE else row.get("tenant_id")
                if row_tid != tenant_id:
                    raise TenantImportRefused(f"row in {table} belongs to another tenant")
                seen[table] += 1
                if table == CHECKPOINTS_TABLE:
                    skipped_cp += 1
                    continue
                if table == VAULT_KEYS_TABLE:
                    custody = row.get("custody")
                    if custody != ALLOWED_CUSTODY:
                        raise TenantImportRefused(
                            f"vault key {row.get('id')} has custody {custody!r}; only platform custody is supported"
                        )
                    if row.get("status") in ("active", "rotating") and isinstance(row.get("purpose"), str):
                        key_purposes.add(str(row["purpose"]))
                tcols, cols = col_types[table], list(row.keys())
                if any(c not in tcols for c in cols):
                    raise TenantImportRefused(f"unknown column in {table}")
                ckey = (table, tuple(cols))
                if (stmt := stmt_cache.get(ckey)) is None:
                    stmt = stmt_cache[ckey] = _insert_sql(table, cols, tcols)
                conn.execute(stmt, tuple(_adapt_value(row[c], tcols[c][1]) for c in cols))
                loaded += 1

            if seen != expected:
                raise TenantImportRefused("imported row counts do not match export header")
            conn.execute("SET session_replication_role = origin")

    key_purposes.update(p for _, _, p, _ in dec_specs)
    keys_created = [key_name(tenant_id, p) for p in sorted(key_purposes)]
    for kname in keys_created:
        await vault.create_key(kname)
    if dec_specs:
        await _reencrypt_columns(owner_url, vault, tenant_id, dec_specs)
    cp_id = await _post_import_audit(app_url, vault, tenant_id)
    return ImportResult(tenant_id, expected, loaded, skipped_cp, keys_created, cp_id)


def import_tenant(
    path: Path,
    owner_url: str,
    app_url: str,
    *,
    vault: Vault | None = None,
    settings: Settings | None = None,
    encrypted_columns: Mapping[tuple[str, str], EncryptedField] = ENCRYPTED_COLUMNS,
) -> ImportResult:
    """Loads an `NXTE/1` file into an empty tenant on this install (all or nothing)."""

    async def _go() -> ImportResult:
        if vault is not None:
            return await _run_import(path, owner_url, app_url, vault, encrypted_columns)
        if settings is None:
            raise RuntimeError("vault or settings required for tenant import")
        async with httpx2.AsyncClient(timeout=30) as http:
            return await _run_import(path, owner_url, app_url, HttpVault(settings, http), encrypted_columns)

    return asyncio.run(_go(), loop_factory=asyncio.SelectorEventLoop)


def run_tenant_import(
    settings: Settings,
    path: Path,
    *,
    vault: Vault | None = None,
    encrypted_columns: Mapping[tuple[str, str], EncryptedField] = ENCRYPTED_COLUMNS,
) -> ImportResult:
    """CLI entry helper using `settings.migrate_database_url` and `settings.database_url`."""
    owner, app = settings.migrate_database_url.get_secret_value(), settings.database_url.get_secret_value()
    return import_tenant(path, owner, app, vault=vault, settings=settings, encrypted_columns=encrypted_columns)
