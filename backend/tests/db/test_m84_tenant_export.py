"""Tenant export DB tests (NEX-106, DM-8): tenant isolation, no plain PII, FieldCipher decryption, job row."""

import asyncio
import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import psycopg
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from sqlalchemy import create_engine, text

from nexus.agent import run as agent_run
from nexus.agent.backup import libpq_url
from nexus.agent.jobs import backup_dir, ensure_import_key, run_tenant_export
from nexus.agent.state import run_once
from nexus.agent.tenant_export import (
    FORMAT,
    EncryptedField,
    decrypt_export_rows,
    export_header,
    pem_fingerprint,
    read_export_header,
    tenant_tables_and_revision,
    unwrap_export_key,
)
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.vault import FakeVault, key_name
from nexus.settings import Settings
from tests.db.conftest import DbUrls

TENANT = "ten-ls"


@pytest.fixture
def agent(tmp_path: Path, test_db: DbUrls) -> Iterator[tuple[Settings, FakeVault]]:
    settings = Settings(
        install_mode="self_hosted",
        install_id="ins-test-export",
        install_dir=tmp_path,
        database_url=test_db.app_url,  # type: ignore[arg-type]
        migrate_database_url=test_db.owner_url,  # type: ignore[arg-type]
    )
    app = create_engine(test_db.app_url)
    with app.begin() as conn:
        run_once(conn, settings)
    app.dispose()
    try:
        yield settings, FakeVault()
    finally:
        owner = create_engine(test_db.owner_url)
        with owner.begin() as conn:  # shared test database: leave as found
            for sql in (
                "DELETE FROM install_backups",
                "DELETE FROM install_status",
                "DELETE FROM entitlements WHERE module_id = 'M84'",
            ):
                conn.execute(text(sql))
        owner.dispose()


def _tenant_db_snapshot(owner_url: str, tenant_id: str) -> tuple[dict[str, int], list[str], list[str]]:
    with psycopg.connect(libpq_url(owner_url)) as conn:
        tables, _ = tenant_tables_and_revision(conn)
        counts: dict[str, int] = {}
        for t in tables:
            where = "id = %s" if t == "tenants" else "tenant_id = %s"
            row = conn.execute(f'SELECT count(*) FROM "{t}" WHERE {where}', (tenant_id,)).fetchone()  # noqa: S608
            counts[t] = int(row[0]) if row else 0
        other_tenants = [
            str(r[0]) for r in conn.execute("SELECT id FROM tenants WHERE id <> %s", (tenant_id,)).fetchall()
        ]
        names = [
            str(r[0])
            for r in conn.execute("SELECT legal_name FROM people WHERE tenant_id = %s", (tenant_id,)).fetchall()
        ]
    return counts, other_tenants, names


def test_tenant_export_isolates_one_tenant_and_records_job(
    agent: tuple[Settings, FakeVault], test_db: DbUrls, tmp_path: Path
) -> None:
    settings, dest_vault = agent
    pem = ensure_import_key(settings, dest_vault)
    pem_path = tmp_path / "dest.pem"
    pem_path.write_text(pem, encoding="utf-8")

    expected_counts, other_tenants, names = _tenant_db_snapshot(test_db.owner_url, TENANT)
    assert len(other_tenants) >= 1 and len(names) >= 1

    done = run_tenant_export(settings, TENANT, pem_path)
    path = Path(done["file"])
    raw = path.read_bytes()

    # Header carries counts and metadata only; raw bytes contain no plain person name.
    header = export_header(path)
    assert header.fields["format"] == FORMAT
    assert header.fields["tenantId"] == TENANT
    assert header.fields["sourceInstallId"] == "ins-test-export"
    assert header.fields["pemSha256"] == pem_fingerprint(pem)
    assert header.fields["tables"] == expected_counts
    # Credentials, live sign-ins and cached responses never travel (D58).
    assert header.fields["notExported"] == ["idempotency_keys", "scim_tokens", "sessions"]
    assert not {"sessions", "scim_tokens", "idempotency_keys"} & set(expected_counts)
    assert "academic_calendars" in expected_counts and "people" in expected_counts
    for name in names:
        assert name.encode("utf-8") not in raw
        assert name not in json.dumps(done)

    # Unwrap via destination Vault and verify every row belongs exclusively to TENANT.
    data_key = asyncio.run(unwrap_export_key(dest_vault, header))
    seen_counts: dict[str, int] = dict.fromkeys(expected_counts, 0)
    exported_names: set[str] = set()
    with path.open("rb") as src:
        h = read_export_header(src)
        for table, row in decrypt_export_rows(src, data_key, h):
            seen_counts[table] = seen_counts.get(table, 0) + 1
            if table == "tenants":
                assert row["id"] == TENANT
            else:
                assert row["tenant_id"] == TENANT
            if table == "people":
                exported_names.add(str(row["legal_name"]))
            serialized = json.dumps(row)
            for other in other_tenants:
                assert other not in serialized

    assert seen_counts == expected_counts
    assert exported_names == set(names)

    # Job recorded in install_backups as tenant_export without touching last_backup_at.
    app = create_engine(test_db.app_url)
    with app.connect() as conn:
        job: Any = conn.execute(
            text("SELECT id, kind, status, encrypted, size_bytes, finished_at, file_name FROM install_backups")
        ).one()
        last_bkp = conn.execute(text("SELECT last_backup_at FROM install_status WHERE id = 1")).scalar()
    app.dispose()
    assert (job.id, job.kind, job.status, job.encrypted) == (done["id"], "tenant_export", "done", True)
    assert job.size_bytes == path.stat().st_size and job.finished_at is not None and job.file_name == path.name
    assert last_bkp is None


def test_tenant_export_decrypts_field_encrypted_values(
    agent: tuple[Settings, FakeVault], test_db: DbUrls, tmp_path: Path
) -> None:
    settings, dest_vault = agent
    src_vault = FakeVault()
    pem_path = tmp_path / "dest.pem"
    pem_path.write_text(ensure_import_key(settings, dest_vault), encoding="utf-8")

    # Encrypt one real DB TEXT column value with FieldCipher, export, and restore the row afterwards.
    allergy_note = "Severe peanut allergy — EpiPen"
    kname = key_name(TENANT, "field_health")

    async def _seal() -> str:
        await src_vault.create_key(kname)
        return await FieldCipher(src_vault).encrypt(kname, "ai_chunks.content", allergy_note)

    sealed = asyncio.run(_seal())
    owner = create_engine(test_db.owner_url)
    with owner.begin() as conn:
        target: Any = conn.execute(
            text("SELECT id, content FROM ai_chunks WHERE tenant_id = :t ORDER BY id LIMIT 1"), {"t": TENANT}
        ).one()
        conn.execute(text("UPDATE ai_chunks SET content = :v WHERE id = :id"), {"v": sealed, "id": target.id})
    try:
        spec = {("ai_chunks", "content"): EncryptedField("field_health", "ai_chunks.content")}
        done = run_tenant_export(settings, TENANT, pem_path, vault=src_vault, encrypted_columns=spec)
        path = Path(done["file"])
        raw = path.read_bytes()
        assert allergy_note.encode("utf-8") not in raw
        assert sealed.encode("utf-8") not in raw

        hdr = export_header(path)
        assert hdr.fields["decryptedColumns"] == [
            {"table": "ai_chunks", "column": "content", "purpose": "field_health", "field": "ai_chunks.content"}
        ]
        data_key = asyncio.run(unwrap_export_key(dest_vault, hdr))
        found = None
        with path.open("rb") as src:
            h = read_export_header(src)
            for table, row in decrypt_export_rows(src, data_key, h):
                if table == "ai_chunks" and row["id"] == target.id:
                    found = row["content"]
        assert found == allergy_note
    finally:
        with owner.begin() as conn:
            conn.execute(
                text("UPDATE ai_chunks SET content = :v WHERE id = :id"),
                {"v": target.content, "id": target.id},
            )
        owner.dispose()


def test_small_key_refused_and_records_failed_job(
    agent: tuple[Settings, FakeVault], test_db: DbUrls, tmp_path: Path
) -> None:
    settings, _ = agent
    small_pem = tmp_path / "small.pem"
    small_pem.write_bytes(
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
        .public_key()
        .public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    )
    with pytest.raises(ValueError, match="3072"):
        run_tenant_export(settings, TENANT, small_pem)
    app = create_engine(test_db.app_url)
    with app.connect() as conn:
        job: Any = conn.execute(text("SELECT kind, status, size_bytes, finished_at FROM install_backups")).one()
    app.dispose()
    assert (job.kind, job.status, job.size_bytes) == ("tenant_export", "failed", None)
    assert job.finished_at is not None
    assert not list(backup_dir(settings).glob("*.nxte")) if backup_dir(settings).exists() else True


def test_cli_export_tenant_prints_counts_and_no_people(
    agent: tuple[Settings, FakeVault],
    test_db: DbUrls,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    settings, dest_vault = agent
    pem_path = tmp_path / "dest.pem"
    pem_path.write_text(ensure_import_key(settings, dest_vault), encoding="utf-8")
    _, _, names = _tenant_db_snapshot(test_db.owner_url, TENANT)

    monkeypatch.setattr(agent_run, "get_settings", lambda: settings)
    monkeypatch.setattr("sys.argv", ["nexus-agent", "export-tenant", TENANT, "--to", str(pem_path)])
    agent_run.main()
    out = capsys.readouterr().out
    assert TENANT in out and "tables" in out and "rows" in out and ".nxte" in out
    for name in names:
        assert name not in out
