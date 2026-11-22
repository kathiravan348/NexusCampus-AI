"""Encrypted backup and restore of the product database (M84, NEX-112).

Plain layout inside the encrypted stream: per table `T` + name, then `D` + 4-byte length + COPY BINARY bytes (repeated),
then `E`; finally `Z`. No `pg_dump` needed and no plain data on disk. Backups read every tenant, so they run with the
owner connection; restore loads into an *empty* database after building the schema with the migrations.
"""

import secrets
import struct
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import BinaryIO

import psycopg
from sqlalchemy.engine import make_url

from nexus.agent.crypto import BackupCorrupt, Header, decrypt_stream, encrypt_stream, new_nonce_prefix, read_header

FORMAT = "nexus-backup/1"
SKIP_TABLES = {"alembic_version"}


def libpq_url(sqlalchemy_url: str) -> str:
    return make_url(sqlalchemy_url).set(drivername="postgresql").render_as_string(hide_password=False)


def _ident(name: str) -> str:
    if not name.replace("_", "").isalnum():
        raise ValueError(f"unexpected table name {name!r}")
    return f'"{name}"'


def tables_and_revision(conn: psycopg.Connection) -> tuple[list[str], str]:
    tables = [
        r[0]
        for r in conn.execute(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"
        ).fetchall()
        if r[0] not in SKIP_TABLES
    ]
    revision = conn.execute("SELECT version_num FROM alembic_version").fetchone()
    if revision is None:
        raise RuntimeError("the database has no migration revision")
    return tables, str(revision[0])


def _records(conn: psycopg.Connection, tables: list[str]) -> Iterator[bytes]:
    for table in tables:
        name = table.encode()
        yield b"T" + struct.pack(">H", len(name)) + name
        with conn.cursor().copy(f"COPY {_ident(table)} TO STDOUT (FORMAT BINARY)") as copy:
            for block in copy:
                data = bytes(block)
                yield b"D" + struct.pack(">I", len(data)) + data
        yield b"E"
    yield b"Z"


@dataclass(frozen=True)
class BackupResult:
    id: str
    path: Path
    plaintext_bytes: int
    file_bytes: int
    tables: int
    revision: str


def write_backup(owner_url: str, out_dir: Path, key: bytes, wrapped_key: str, key_name: str) -> BackupResult:
    """Streams every table into an encrypted file under `out_dir` (one REPEATABLE READ snapshot)."""
    backup_id = "bkp-" + datetime.now(UTC).strftime("%Y%m%d%H%M%S") + "-" + secrets.token_hex(3)
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{backup_id}.nxbk"
    with psycopg.connect(libpq_url(owner_url)) as conn:
        conn.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY")
        tables, revision = tables_and_revision(conn)
        header = Header(
            {
                "format": FORMAT,
                "id": backup_id,
                "createdAt": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "revision": revision,
                "tables": len(tables),
                "keyName": key_name,
                "wrappedKey": wrapped_key,
                "noncePrefix": new_nonce_prefix(),
            }
        )
        with path.open("xb") as out:
            plain = encrypt_stream(out, key, header, _records(conn, tables))
    return BackupResult(backup_id, path, plain, path.stat().st_size, len(tables), revision)


def backup_header(path: Path) -> Header:
    with path.open("rb") as src:
        return read_header(src)


class _Reader:
    """Pulls exact byte counts out of the verified plaintext chunks."""

    def __init__(self, chunks: Iterator[bytes]) -> None:
        self._chunks, self._buf = chunks, bytearray()

    def take(self, n: int) -> bytes:
        while len(self._buf) < n:
            try:
                self._buf += next(self._chunks)
            except StopIteration as exc:
                raise BackupCorrupt("backup ends early") from exc
        out = bytes(self._buf[:n])
        del self._buf[:n]
        return out


def restore_backup(path: Path, key: bytes, target_owner_url: str) -> dict[str, int]:
    """Loads a verified backup into `target` (schema already at the backup's revision); returns rows per table."""
    with path.open("rb") as src:
        header = read_header(src)
        reader = _Reader(decrypt_stream(src, key, header))
        counts: dict[str, int] = {}
        with psycopg.connect(libpq_url(target_owner_url)) as conn:
            target_tables, revision = tables_and_revision(conn)
            if revision != header.fields["revision"]:
                raise RuntimeError(f"target schema {revision} differs from the backup's {header.fields['revision']}")
            conn.execute("SET session_replication_role = replica")  # load in any order; constraints were valid
            # Migrations seed reference data (e.g. the permission catalogue); the backup's own rows replace it.
            conn.execute(f"TRUNCATE {', '.join(_ident(t) for t in target_tables)}")
            while (kind := reader.take(1)) != b"Z":
                if kind != b"T":
                    raise BackupCorrupt("unexpected record")
                (n,) = struct.unpack(">H", reader.take(2))
                table = reader.take(n).decode()
                with conn.cursor().copy(f"COPY {_ident(table)} FROM STDIN (FORMAT BINARY)") as copy:
                    while (tag := reader.take(1)) == b"D":
                        (size,) = struct.unpack(">I", reader.take(4))
                        copy.write(reader.take(size))
                    if tag != b"E":
                        raise BackupCorrupt("unexpected record")
                counts[table] = int(conn.execute(f"SELECT count(*) FROM {_ident(table)}").fetchone()[0])  # type: ignore[index]  # noqa: S608
            conn.execute("SET session_replication_role = origin")
    return counts


def verify_backup(src: BinaryIO, key: bytes) -> int:
    """Reads the whole file through the checks; returns the plaintext size."""
    header = read_header(src)
    return sum(len(c) for c in decrypt_stream(src, key, header))
