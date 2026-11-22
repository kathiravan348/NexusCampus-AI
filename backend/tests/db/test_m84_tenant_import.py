"""Tenant import `NXTE/1` DB tests (NEX-119, D58, D59): round trip, refusals, rollback, FieldCipher re-encryption."""

import asyncio
import io
import os
import secrets
from collections.abc import Coroutine, Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import psycopg
import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from nexus.agent import run as agent_run
from nexus.agent.backup import libpq_url
from nexus.agent.crypto import BackupCorrupt, Header, encrypt_stream
from nexus.agent.jobs import ensure_import_key
from nexus.agent.tenant_export import (
    IMPORT_KEY_NAME,
    EncryptedField,
    encrypt_rows,
    tenant_tables_and_revision,
    write_tenant_export,
)
from nexus.agent.tenant_import import TenantImportRefused, import_tenant
from nexus.core.checkpoints import CHECKPOINT_KEY, create_checkpoint, verify_checkpoints
from nexus.core.fieldcrypto import FieldCipher, FieldUnreadable
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.core.vault import FakeVault, key_name
from nexus.settings import Settings
from tests.db.conftest import DbUrls, create_test_database, drop_test_database, migrate

TENANT = "ten-ls"


def _run[T](coro: Coroutine[Any, Any, T]) -> T:
    return asyncio.run(coro, loop_factory=asyncio.SelectorEventLoop)


@contextmanager
def _empty_db(revision: str = "head") -> Iterator[tuple[str, str]]:
    name = f"nexus_import_{secrets.token_hex(4)}"
    owner_url, password = create_test_database(name)
    try:
        migrate(owner_url, password, revision)
        app_url = make_url(owner_url).set(username="nexus_app", password=password).render_as_string(hide_password=False)
        yield owner_url, app_url
    finally:
        drop_test_database(name)


def _tables_and_rev(owner_url: str) -> tuple[list[str], str]:
    with psycopg.connect(libpq_url(owner_url)) as conn:
        return tenant_tables_and_revision(conn)


def _tenant_rows(owner_url: str, tenant_id: str, table: str) -> list[dict[str, Any]]:
    where = "id = %s" if table == "tenants" else "tenant_id = %s"
    with psycopg.connect(libpq_url(owner_url)) as conn, conn.cursor() as cur:
        cur.execute(f'SELECT * FROM "{table}" WHERE {where}', (tenant_id,))  # noqa: S608
        cols = [d.name for d in (cur.description or ())]
        rows = [dict(zip(cols, r, strict=True)) for r in cur.fetchall()]
    rows.sort(key=lambda r: tuple(str(r[k]) for k in sorted(r)))
    return rows


def _tenant_count(owner_url: str) -> int:
    with psycopg.connect(libpq_url(owner_url)) as conn:
        r = conn.execute("SELECT count(*) FROM tenants").fetchone()
        return int(r[0]) if r else 0


def _synth(
    path: Path, tid: str, rev: str, pem: str, counts: dict[str, int], rows: list[tuple[str, dict[str, Any]]]
) -> Path:
    with path.open("wb") as out:
        kw: dict[str, Any] = {"export_id": f"exp-{path.stem}", "tenant_id": tid, "source_install_id": "ins-src"}
        encrypt_rows(out, revision=rev, dest_pem=pem, counts=counts, rows=rows, **kw)
    return path


def _settings(tmp_path: Path, iid: str, app_url: str, owner_url: str) -> Settings:
    kw: dict[str, Any] = {"database_url": app_url, "migrate_database_url": owner_url}
    return Settings(install_mode="self_hosted", install_id=iid, install_dir=tmp_path, **kw)


def test_export_import_round_trip_verifies_chain_checkpoint_and_cli_output(
    test_db: DbUrls, tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    src_vault, dest_vault = FakeVault(), FakeVault()
    dest_pem = ensure_import_key(_settings(tmp_path, "ins-src", test_db.app_url, test_db.owner_url), dest_vault)

    async def _seed_src_checkpoint() -> str:
        eng = create_async_engine(test_db.app_url)
        try:
            await src_vault.create_signing_key(CHECKPOINT_KEY)
            ctx = TenantContext(TENANT)
            async with async_sessionmaker(eng, expire_on_commit=False)() as s, s.begin():
                await bind_tenant(s, ctx)
                cp, _ = await create_checkpoint(s, src_vault, ctx, date(2026, 5, 4))
                assert cp is not None
                return cp.id
        finally:
            await eng.dispose()

    src_cp_id = _run(_seed_src_checkpoint())
    try:
        exported = write_tenant_export(
            test_db.owner_url, tmp_path / "exports", TENANT, dest_pem, source_install_id="ins-src"
        )
        assert exported.counts["audit_checkpoints"] == 1
        src_tables, rev = _tables_and_rev(test_db.owner_url)

        with _empty_db(rev) as (dst_owner, dst_app):
            dst_s = _settings(tmp_path, "ins-dst", dst_app, dst_owner)
            monkeypatch.setattr(agent_run, "get_settings", lambda: dst_s)
            monkeypatch.setattr(
                agent_run, "run_tenant_import", lambda s, p: import_tenant(p, dst_owner, dst_app, vault=dest_vault)
            )
            monkeypatch.setattr("sys.argv", ["nexus-agent", "import-tenant", str(exported.path)])
            agent_run.main()
            cli_out = capsys.readouterr().out
            assert TENANT in cli_out and "1 checkpoints skipped" in cli_out and "keys created" in cli_out
            assert all(str(p["legal_name"]) not in cli_out for p in _tenant_rows(test_db.owner_url, TENANT, "people"))

            skip = {"audit_checkpoints", "audit_events", "audit_chain_heads"}
            for tbl in src_tables:
                if tbl not in skip:
                    assert _tenant_rows(dst_owner, TENANT, tbl) == _tenant_rows(test_db.owner_url, TENANT, tbl), tbl

            async def _check_dest() -> None:
                eng = create_async_engine(dst_app)
                try:
                    async with async_sessionmaker(eng, expire_on_commit=False)() as s, s.begin():
                        await bind_tenant(s, TenantContext(TENANT))
                        report = await verify_checkpoints(s, dest_vault, TENANT)
                        assert report.ok and len(report.checkpoints) == 1
                        assert report.checkpoints[0].checkpoint.id != src_cp_id
                        q = text("SELECT action FROM audit_events ORDER BY seq DESC LIMIT 2")
                        acts = [str(r[0]) for r in (await s.execute(q)).all()]
                        assert acts == ["m06.auditCheckpoint.signed", "m84.tenant.imported"]
                finally:
                    await eng.dispose()

            _run(_check_dest())
            assert key_name(TENANT, "tenant_data") in dest_vault.keys
    finally:
        with psycopg.connect(libpq_url(test_db.owner_url)) as conn:
            conn.execute("SET LOCAL nexus.audit_maintenance = 'on'")
            conn.execute("DELETE FROM audit_checkpoints WHERE id = %s", (src_cp_id,))
            conn.execute("DELETE FROM audit_events WHERE tenant_id = %s AND target_id = %s", (TENANT, src_cp_id))
            last = conn.execute(
                "SELECT seq, hash FROM audit_events WHERE tenant_id = %s ORDER BY seq DESC LIMIT 1", (TENANT,)
            ).fetchone()
            assert last is not None
            conn.execute(
                "UPDATE audit_chain_heads SET last_seq = %s, last_hash = %s WHERE tenant_id = %s",
                (last[0], last[1], TENANT),
            )


def test_refusals_and_atomic_rollback(test_db: DbUrls, tmp_path: Path) -> None:
    dest_vault, other_vault = FakeVault(), FakeVault()

    async def _pems() -> tuple[str, str]:
        await dest_vault.create_import_key(IMPORT_KEY_NAME)
        await other_vault.create_import_key(IMPORT_KEY_NAME)
        return await dest_vault.public_key_pem(IMPORT_KEY_NAME), await other_vault.public_key_pem(IMPORT_KEY_NAME)

    dest_pem, other_pem = _run(_pems())
    exported = write_tenant_export(test_db.owner_url, tmp_path / "exp", TENANT, dest_pem, source_install_id="ins-src")
    _, rev = _tables_and_rev(test_db.owner_url)
    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _trow(tid: str) -> tuple[str, dict[str, Any]]:
        return (
            "tenants",
            {"id": tid, "name": tid, "type": "k12", "region": "in", "created_at": now, "updated_at": now},
        )

    # 1. Tenant already exists.
    with pytest.raises(TenantImportRefused, match="already exists"):
        import_tenant(exported.path, test_db.owner_url, test_db.app_url, vault=dest_vault)

    with _empty_db(rev) as (dst_owner, dst_app):
        # 2. Wrong format (`nexus-backup/1`).
        bkp, buf = tmp_path / "bkp.nxbk", io.BytesIO()
        encrypt_stream(buf, os.urandom(32), Header({"format": "nexus-backup/1", "noncePrefix": "a1b2c3d4"}), [b"x"])
        bkp.write_bytes(buf.getvalue())
        with pytest.raises(TenantImportRefused, match="format"):
            import_tenant(bkp, dst_owner, dst_app, vault=dest_vault)

        # 3. Wrong destination PEM.
        wrong = write_tenant_export(test_db.owner_url, tmp_path / "e2", TENANT, other_pem, source_install_id="ins-src")
        with pytest.raises(TenantImportRefused, match="tenant-import key"):
            import_tenant(wrong.path, dst_owner, dst_app, vault=dest_vault)

        # 4. Schema revision mismatch.
        bad_rev = _synth(tmp_path / "r.nxte", "ten-r", "0001_tenancy", dest_pem, {"tenants": 1}, [_trow("ten-r")])
        with pytest.raises(TenantImportRefused, match="revision"):
            import_tenant(bad_rev, dst_owner, dst_app, vault=dest_vault)

        # 5. Unknown table & NOT_EXPORTED table.
        for bad_tbl, match in (("ghost_table", "does not exist"), ("sessions", "NOT_EXPORTED")):
            counts = {"tenants": 1, bad_tbl: 0}
            bad_t = _synth(tmp_path / f"{bad_tbl}.nxte", "ten-t", rev, dest_pem, counts, [_trow("ten-t")])
            with pytest.raises(TenantImportRefused, match=match):
                import_tenant(bad_t, dst_owner, dst_app, vault=dest_vault)

        # 6. BYOK vault key -> refused mid-stream and rolled back.
        byok_row: dict[str, Any] = dict(
            id="key-byok-1",
            tenant_id="ten-byok",
            purpose="tenant_data",
            custody="byok",
            status="active",
            vault_key_name="tenant-ten-byok-tenant-data",
            created_at=now,
            rotated_at=None,
        )
        rows_b = [_trow("ten-byok"), ("vault_keys", byok_row)]
        byok = _synth(tmp_path / "b.nxte", "ten-byok", rev, dest_pem, {"tenants": 1, "vault_keys": 1}, rows_b)
        with pytest.raises(TenantImportRefused, match="byok"):
            import_tenant(byok, dst_owner, dst_app, vault=dest_vault)
        assert _tenant_count(dst_owner) == 0

        # 7. Tampered last chunk -> rolled back.
        tampered, raw = tmp_path / "tampered.nxte", bytearray(exported.path.read_bytes())
        raw[-5] ^= 0xFF
        tampered.write_bytes(bytes(raw))
        with pytest.raises(BackupCorrupt):
            import_tenant(tampered, dst_owner, dst_app, vault=dest_vault)
        assert _tenant_count(dst_owner) == 0

        # 8. Header count mismatch -> rolled back.
        cnt = _synth(tmp_path / "c.nxte", "ten-c", rev, dest_pem, {"tenants": 1, "people": 2}, [_trow("ten-c")])
        with pytest.raises(TenantImportRefused, match="counts"):
            import_tenant(cnt, dst_owner, dst_app, vault=dest_vault)
        assert _tenant_count(dst_owner) == 0


@pytest.mark.parametrize("key_service_down", [False, True])
def test_field_encrypted_column_reencrypted_under_destination_key(
    test_db: DbUrls, tmp_path: Path, key_service_down: bool
) -> None:
    """D59: values are encrypted before they are written; if the key service fails, nothing is written at all."""
    src_vault, dest_vault = FakeVault(), FakeVault()
    allergy_note, kname = "Severe peanut allergy — EpiPen", key_name(TENANT, "field_health")

    async def _prep() -> tuple[str, str]:
        await src_vault.create_key(kname)
        await dest_vault.create_import_key(IMPORT_KEY_NAME)
        sealed = await FieldCipher(src_vault).encrypt(kname, "ai_chunks.content", allergy_note)
        return sealed, await dest_vault.public_key_pem(IMPORT_KEY_NAME)

    src_sealed, dest_pem = _run(_prep())
    with psycopg.connect(libpq_url(test_db.owner_url)) as conn:
        target = conn.execute(
            "SELECT id, content FROM ai_chunks WHERE tenant_id = %s ORDER BY id LIMIT 1", (TENANT,)
        ).fetchone()
        assert target is not None
        conn.execute("UPDATE ai_chunks SET content = %s WHERE id = %s", (src_sealed, target[0]))
    try:
        spec = {("ai_chunks", "content"): EncryptedField("field_health", "ai_chunks.content")}
        exported = write_tenant_export(
            test_db.owner_url,
            tmp_path / "exp",
            TENANT,
            dest_pem,
            source_install_id="ins-src",
            vault=src_vault,
            encrypted_columns=spec,
        )
        _, rev = _tables_and_rev(test_db.owner_url)
        with _empty_db(rev) as (dst_owner, dst_app):
            if key_service_down:

                async def _down(name: str) -> None:
                    raise RuntimeError("key service down")

                dest_vault.create_key = _down  # type: ignore[method-assign]
                with pytest.raises(RuntimeError, match="key service down"):
                    import_tenant(exported.path, dst_owner, dst_app, vault=dest_vault)
                with psycopg.connect(libpq_url(dst_owner)) as pconn:
                    assert pconn.execute("SELECT count(*) FROM tenants").fetchone() == (0,)  # rolled back: re-runnable
                    plain = pconn.execute("SELECT count(*) FROM ai_chunks WHERE content = %s", (allergy_note,))
                    assert plain.fetchone() == (0,)  # never written in plain
                return
            else:
                imp = import_tenant(exported.path, dst_owner, dst_app, vault=dest_vault)
                assert kname in imp.keys_created
            with psycopg.connect(libpq_url(dst_owner)) as pconn:
                r = pconn.execute("SELECT content FROM ai_chunks WHERE id = %s", (target[0],)).fetchone()
                assert r is not None
                stored = str(r[0])
            assert stored.startswith("v1:") and allergy_note not in stored and stored != src_sealed

            async def _decrypt_check() -> None:
                assert await FieldCipher(dest_vault).decrypt(kname, "ai_chunks.content", stored) == allergy_note
                with pytest.raises(FieldUnreadable):
                    await FieldCipher(src_vault).decrypt(kname, "ai_chunks.content", stored)

            _run(_decrypt_check())
    finally:
        with psycopg.connect(libpq_url(test_db.owner_url)) as conn:
            conn.execute("UPDATE ai_chunks SET content = %s WHERE id = %s", (target[1], target[0]))
