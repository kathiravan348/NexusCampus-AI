"""Tenant export `NXTE/1` (DM-8, D58, NEX-106): one tenant's rows streamed through chunked AES-256-GCM under a fresh
256-bit data key wrapped with RSA-OAEP-SHA256 for the destination's OpenBao `tenant-import` PEM. Nothing plain on disk.
"""

import asyncio
import base64
import hashlib
import json
import os
import secrets
from collections.abc import Iterable, Iterator, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Any, BinaryIO

import httpx2
import psycopg
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat, load_pem_public_key
from psycopg import sql

from nexus.agent.backup import libpq_url
from nexus.agent.crypto import BackupCorrupt, Header, decrypt_stream, encrypt_stream, new_nonce_prefix, read_header
from nexus.core.fieldcrypto import PREFIX as FIELD_PREFIX
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.vault import HttpVault, Vault, key_name
from nexus.settings import Settings

FORMAT = "NXTE/1"
IMPORT_KEY_NAME = "tenant-import"
MIN_RSA_BITS = 3072
TENANTS_TABLE = "tenants"
#: Never exported (D58): sign-in sessions (token hashes, IP addresses), SCIM token hashes and cached API responses.
#: Credentials and caches do not move between installs; people sign in again and SCIM tokens are issued anew there.
NOT_EXPORTED = ("idempotency_keys", "scim_tokens", "sessions")
_OAEP = padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None)


@dataclass(frozen=True)
class EncryptedField:
    purpose: str
    field: str


#: Columns encrypted with `FieldCipher`: `(table, column) -> EncryptedField(purpose, field_path)`.
#: Stage 1-2 tables have no `FieldCipher`-encrypted columns yet; Stage 3+ sensitive columns register here.
ENCRYPTED_COLUMNS: dict[tuple[str, str], EncryptedField] = {
    ("applications", "sensitive_answers"): EncryptedField("tenant_data", "applications.sensitive_answers"),
    ("attendance_marks", "note"): EncryptedField("tenant_data", "attendance_marks.note"),
    ("leave_requests", "reason"): EncryptedField("tenant_data", "leave_requests.reason"),
    ("concessions", "reason"): EncryptedField("tenant_data", "concessions.reason"),
    ("fee_refunds", "reason"): EncryptedField("tenant_data", "fee_refunds.reason"),
    ("mark_entries", "remark"): EncryptedField("tenant_data", "mark_entries.remark"),
    ("revaluation_requests", "reason"): EncryptedField("tenant_data", "revaluation_requests.reason"),
    ("report_cards", "line_remarks"): EncryptedField("tenant_data", "report_cards.line_remarks"),
    ("report_cards", "overall_remark"): EncryptedField("tenant_data", "report_cards.overall_remark"),
    ("issued_documents", "revoked_reason"): EncryptedField("tenant_data", "issued_documents.revoked_reason"),
    ("thread_messages", "body"): EncryptedField("tenant_data", "thread_messages.body"),
    ("meeting_bookings", "note"): EncryptedField("tenant_data", "meeting_bookings.note"),
    ("guardian_relationships", "court_order_note"): EncryptedField(
        "tenant_data", "guardian_relationships.court_order_note"
    ),
    ("learners", "health_flags"): EncryptedField("field_health", "learners.health_flags"),
    ("learners", "sensitive_custom_fields"): EncryptedField("tenant_data", "learners.sensitive_custom_fields"),
}


@dataclass(frozen=True)
class ExportResult:
    id: str
    tenant_id: str
    path: Path
    plaintext_bytes: int
    file_bytes: int
    counts: dict[str, int]
    revision: str
    pem_sha256: str


def load_rsa_public_key(pem: str | bytes) -> RSAPublicKey:
    """Parses a PEM public key and refuses anything other than RSA >= 3072 bits."""
    try:
        key = load_pem_public_key(pem.encode("ascii") if isinstance(pem, str) else pem)
    except (TypeError, ValueError) as exc:
        raise ValueError("destination key is not a valid PEM public key") from exc
    if not isinstance(key, rsa.RSAPublicKey):
        raise ValueError("destination key must be an RSA public key")
    if key.key_size < MIN_RSA_BITS:
        raise ValueError(f"destination RSA key must be at least {MIN_RSA_BITS} bits (got {key.key_size})")
    return key


def pem_fingerprint(pem: str | bytes) -> str:
    spki = load_rsa_public_key(pem).public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    return hashlib.sha256(spki).hexdigest()


def wrap_data_key(data_key: bytes, pub: RSAPublicKey) -> str:
    return base64.b64encode(pub.encrypt(data_key, _OAEP)).decode("ascii")


async def unwrap_export_key(vault: Vault, header: Header, name: str = IMPORT_KEY_NAME) -> bytes:
    return await vault.rsa_decrypt(name, str(header.fields["wrappedKey"]))


def _json_value(v: Any) -> Any:
    if v is None or isinstance(v, (bool, int, float, str)):
        return v
    if isinstance(v, datetime):
        return v.astimezone(UTC).isoformat().replace("+00:00", "Z")
    if isinstance(v, (date, time)):
        return v.isoformat()
    if isinstance(v, (bytes, bytearray, memoryview)):
        return base64.b64encode(bytes(v)).decode("ascii")
    if isinstance(v, (list, tuple)):
        return [_json_value(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _json_value(x) for k, x in v.items()}
    return str(v)


def _encode_rows(rows: Iterable[tuple[str, dict[str, Any]]]) -> Iterator[bytes]:
    for table, row in rows:
        clean = {k: _json_value(v) for k, v in row.items()}
        yield (json.dumps({"table": table, "row": clean}, ensure_ascii=False, separators=(",", ":")) + "\n").encode()


def encrypt_rows(
    out: BinaryIO,
    *,
    export_id: str,
    tenant_id: str,
    source_install_id: str,
    revision: str,
    dest_pem: str | bytes,
    counts: dict[str, int],
    rows: Iterable[tuple[str, dict[str, Any]]],
    decrypted_columns: list[dict[str, str]] | None = None,
) -> tuple[Header, int]:
    """Encrypts a row stream into `NXTE/1` for `dest_pem`; returns `(header, plaintext_bytes)`."""
    pub, data_key = load_rsa_public_key(dest_pem), os.urandom(32)
    header = Header(
        {
            "format": FORMAT,
            "id": export_id,
            "createdAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "tenantId": tenant_id,
            "sourceInstallId": source_install_id,
            "revision": revision,
            "tables": counts,
            "notExported": list(NOT_EXPORTED),
            "decryptedColumns": decrypted_columns or [],
            "wrappedKey": wrap_data_key(data_key, pub),
            "keyAlgorithm": "RSA-OAEP-SHA256",
            "pemSha256": pem_fingerprint(dest_pem),
            "noncePrefix": new_nonce_prefix(),
        }
    )
    return header, encrypt_stream(out, data_key, header, _encode_rows(rows))


def read_export_header(src: BinaryIO) -> Header:
    header = read_header(src)
    if header.fields.get("format") != FORMAT:
        raise BackupCorrupt("not a NexusCampus tenant export")
    return header


def export_header(path: Path) -> Header:
    with path.open("rb") as src:
        return read_export_header(src)


def decrypt_export_rows(src: BinaryIO, key: bytes, header: Header) -> Iterator[tuple[str, dict[str, Any]]]:
    """Streams verified `(table, row)` pairs from an `NXTE/1` file after `read_export_header`."""
    buf = bytearray()
    for chunk in decrypt_stream(src, key, header):
        buf += chunk
        while (nl := buf.find(b"\n")) != -1:
            line = bytes(buf[:nl])
            del buf[: nl + 1]
            if not line:
                continue
            try:
                obj = json.loads(line.decode("utf-8"))
            except (UnicodeDecodeError, ValueError) as exc:
                raise BackupCorrupt("unreadable export row") from exc
            if (
                not isinstance(obj, dict)
                or not isinstance(obj.get("table"), str)
                or not isinstance(obj.get("row"), dict)
            ):
                raise BackupCorrupt("malformed export row")
            yield obj["table"], obj["row"]
    if buf:
        raise BackupCorrupt("truncated export row")


def tenant_tables_and_revision(conn: psycopg.Connection) -> tuple[list[str], str]:
    rows = conn.execute(
        "SELECT DISTINCT t.tablename FROM pg_tables t "
        "JOIN information_schema.columns c ON c.table_schema = t.schemaname AND c.table_name = t.tablename "
        "WHERE t.schemaname = 'public' AND c.column_name = 'tenant_id' ORDER BY t.tablename"
    ).fetchall()
    revision = conn.execute("SELECT version_num FROM alembic_version").fetchone()
    if revision is None:
        raise RuntimeError("the database has no migration revision")
    tables = [str(r[0]) for r in rows if str(r[0]) not in NOT_EXPORTED]
    return [TENANTS_TABLE, *tables], str(revision[0])


def _filter_col(table: str) -> sql.Identifier:
    return sql.Identifier("id" if table == TENANTS_TABLE else "tenant_id")


class _FieldDecryptor:
    def __init__(
        self, tid: str, specs: Mapping[tuple[str, str], EncryptedField], vault: Vault | None, settings: Settings | None
    ) -> None:
        self._tid, self._vault, self._settings = tid, vault, settings
        self._by_table: dict[str, list[tuple[str, EncryptedField]]] = {}
        for (tbl, col), spec in specs.items():
            self._by_table.setdefault(tbl, []).append((col, spec))
        self._runner: asyncio.Runner | None = None
        self._http: httpx2.AsyncClient | None = None
        self._cipher: FieldCipher | None = None

    def _ensure_cipher(self) -> tuple[asyncio.Runner, FieldCipher]:
        if self._runner is None:
            self._runner = asyncio.Runner()
            self._runner.__enter__()
        if self._cipher is None:
            v = self._vault
            if v is None:
                if self._settings is None:
                    raise RuntimeError("vault or settings required to decrypt field-encrypted columns")
                self._http = httpx2.AsyncClient(timeout=30)
                v = HttpVault(self._settings, self._http)
            self._cipher = FieldCipher(v)
        return self._runner, self._cipher

    def apply(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        for col, spec in self._by_table.get(table, ()):
            if isinstance(val := row.get(col), str) and val.startswith(f"{FIELD_PREFIX}:"):
                runner, cipher = self._ensure_cipher()
                row[col] = runner.run(cipher.decrypt(key_name(self._tid, spec.purpose), spec.field, val))
        return row

    def close(self) -> None:
        if self._runner is not None:
            if self._http is not None:
                self._runner.run(self._http.aclose())
            self._runner.__exit__(None, None, None)


def _stream_rows(
    conn: psycopg.Connection, tables: list[str], tenant_id: str, decryptor: _FieldDecryptor
) -> Iterator[tuple[str, dict[str, Any]]]:
    for table in tables:
        stmt = sql.SQL("SELECT * FROM {} WHERE {} = %s").format(sql.Identifier(table), _filter_col(table))
        with conn.cursor() as cur:
            cur.execute(stmt, (tenant_id,))
            cols = [d.name for d in (cur.description or ())]
            while batch := cur.fetchmany(500):
                for raw in batch:
                    yield table, decryptor.apply(table, dict(zip(cols, raw, strict=True)))


def write_tenant_export(
    owner_url: str,
    out_dir: Path,
    tenant_id: str,
    dest_pem: str | bytes,
    *,
    source_install_id: str,
    vault: Vault | None = None,
    settings: Settings | None = None,
    encrypted_columns: Mapping[tuple[str, str], EncryptedField] = ENCRYPTED_COLUMNS,
) -> ExportResult:
    """Exports one tenant in a single REPEATABLE READ snapshot into an `NXTE/1` file under `out_dir`."""
    load_rsa_public_key(dest_pem)
    export_id = f"exp-{datetime.now(UTC):%Y%m%d%H%M%S}-{secrets.token_hex(3)}"
    out_dir.mkdir(parents=True, exist_ok=True)
    path, decryptor = out_dir / f"{export_id}.nxte", _FieldDecryptor(tenant_id, encrypted_columns, vault, settings)
    dec_meta = [
        {"table": t, "column": c, "purpose": s.purpose, "field": s.field}
        for (t, c), s in sorted(encrypted_columns.items())
    ]
    try:
        with psycopg.connect(libpq_url(owner_url)) as conn:
            conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
            tables, revision = tenant_tables_and_revision(conn)
            counts = {}
            for t in tables:
                q = sql.SQL("SELECT count(*) FROM {} WHERE {} = %s").format(sql.Identifier(t), _filter_col(t))
                row = conn.execute(q, (tenant_id,)).fetchone()
                counts[t] = int(row[0]) if row else 0
            if counts.get(TENANTS_TABLE, 0) == 0:
                raise ValueError(f"unknown tenant: {tenant_id}")
            with path.open("xb") as out:
                header, plain = encrypt_rows(
                    out,
                    export_id=export_id,
                    tenant_id=tenant_id,
                    source_install_id=source_install_id,
                    revision=revision,
                    dest_pem=dest_pem,
                    counts=counts,
                    rows=_stream_rows(conn, tables, tenant_id, decryptor),
                    decrypted_columns=dec_meta,
                )
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        decryptor.close()
    return ExportResult(
        export_id, tenant_id, path, plain, path.stat().st_size, counts, revision, str(header.fields["pemSha256"])
    )
