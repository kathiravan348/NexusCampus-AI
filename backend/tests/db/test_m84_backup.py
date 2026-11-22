"""Encrypted backup → restore into an empty database (NEX-112), and the diagnostics review flow through the API."""

import secrets
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import psycopg
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from nexus.agent.backup import backup_header, libpq_url, restore_backup, tables_and_revision
from nexus.agent.jobs import run_backup, run_diagnostics
from nexus.agent.state import run_once
from nexus.core.vault import FakeVault
from nexus.settings import Settings
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls, create_test_database, drop_test_database, migrate
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}


def row_counts(owner_url: str) -> dict[str, int]:
    with psycopg.connect(libpq_url(owner_url)) as conn:
        tables, _ = tables_and_revision(conn)
        return {t: int(conn.execute(f'SELECT count(*) FROM "{t}"').fetchone()[0]) for t in tables}  # type: ignore[index]  # noqa: S608


@pytest.fixture
def agent(tmp_path: Path, test_db: DbUrls) -> Iterator[tuple[Settings, FakeVault]]:
    settings = Settings(
        install_mode="self_hosted",
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
        with owner.begin() as conn:  # the test database is shared: leave it as found
            for sql in (
                "DELETE FROM install_backups",
                "DELETE FROM install_diagnostics",
                "DELETE FROM install_status",
                "DELETE FROM entitlements WHERE module_id = 'M84'",
            ):
                conn.execute(text(sql))
        owner.dispose()


def test_backup_restores_into_an_empty_database(agent: tuple[Settings, FakeVault], test_db: DbUrls) -> None:
    settings, vault = agent
    done = run_backup(settings, vault)
    path = Path(done["file"])
    assert path.read_bytes()[:4] == b"NXBK"
    header = backup_header(path)
    key = vault  # FakeVault unwraps what it wrapped
    import asyncio

    plain = asyncio.run(key.unwrap(settings.backup_key_name, str(header.fields["wrappedKey"])))
    name = f"nexus_restore_{secrets.token_hex(4)}"
    target, password = create_test_database(name)
    try:
        migrate(target, password, str(header.fields["revision"]))
        restored = restore_backup(path, plain, target)
        source = row_counts(test_db.owner_url)
        # The backup is a snapshot taken before its own job row was marked done.
        source["install_backups"] = restored["install_backups"]
        assert restored == source
        assert sum(restored.values()) > 100
    finally:
        drop_test_database(name)
    app = create_engine(test_db.app_url)
    with app.connect() as conn:
        job: Any = conn.execute(text("SELECT status, size_bytes FROM install_backups")).one()
        last = conn.execute(text("SELECT last_backup_at FROM install_status")).scalar()
    app.dispose()
    assert job.status == "done" and job.size_bytes == path.stat().st_size and last is not None


def test_diagnostics_are_reviewed_before_anything_leaves(
    agent: tuple[Settings, FakeVault], client: TestClient, kc: FakeKeycloak
) -> None:
    settings, _ = agent
    made = run_diagnostics(settings, "TCK-2291")
    client.app.state.settings = client.app.state.settings.model_copy(  # type: ignore[attr-defined]
        update={"install_mode": "self_hosted", "install_dir": settings.install_dir}
    )
    sign_in(client, kc)
    csrf = {"X-CSRF-Token": client.cookies.get("nexus_csrf") or ""}
    bundles = client.get("/api/v1/install/diagnostics").json()["items"]
    assert [(b["id"], b["status"], b["ticketRef"]) for b in bundles] == [(made["id"], "ready_for_review", "TCK-2291")]
    content = client.get(f"/api/v1/install/diagnostics/{made['id']}/content").json()["content"]
    assert '"installStatus"' in content and "password" not in content.lower()
    approved = client.post(f"/api/v1/install/diagnostics/{made['id']}/approve", headers=csrf)
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved" and approved.json()["reviewedBy"]
    assert client.post(f"/api/v1/install/diagnostics/{made['id']}/discard", headers=csrf).status_code == 409
    client.cookies.clear()
    sign_in(client, kc, **ARJUN)
    assert client.get(f"/api/v1/install/diagnostics/{made['id']}/content").status_code == 403
