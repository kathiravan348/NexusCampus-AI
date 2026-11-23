"""Control -> deployment signed commands API & DB tests (D60, NEX-128)."""

from datetime import UTC, datetime, timedelta

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.ext.asyncio import create_async_engine

from nexus.commands.format import DEFAULT_KEY, load_public_keys, public_key_file, verify_command
from nexus.control.commands import enqueue_command
from nexus.core.vault import FakeVault
from nexus.devtools.agent_token import issue_token, revoke_token

API = "/control/api/v1"


async def _enqueue_owner(
    owner_url: str, vault: FakeVault, deployment_id: str, ttl: timedelta = timedelta(minutes=10)
) -> str:
    eng = create_async_engine(owner_url)
    try:
        async with eng.begin() as conn:
            return await enqueue_command(
                conn,
                vault,
                deployment_id=deployment_id,
                kind="ping",
                args={},
                issued_by="cli",
                ttl=ttl,
            )
    finally:
        await eng.dispose()


@pytest.mark.anyio
async def test_commands_fetch_deliver_result_isolation_and_expiry(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner, _ = control_db
    vault = FakeVault()
    tok_in = issue_token(owner, "dep-in-1")
    tok_eu = issue_token(owner, "dep-eu-1")

    cmd_id = await _enqueue_owner(owner, vault, "dep-in-1")
    keys = load_public_keys(await public_key_file(vault, DEFAULT_KEY))

    # Another deployment never sees dep-in-1's command
    r_other = await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_eu}"})
    assert r_other.status_code == 200
    assert r_other.json() == {"items": []}

    # dep-in-1 fetches its signed command and marks it delivered
    r_in = await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_in}"})
    assert r_in.status_code == 200
    items = r_in.json()["items"]
    assert len(items) == 1
    verified = verify_command(items[0]["command"], items[0]["signature"], keys)
    assert verified.id == cmd_id
    assert verified.deployment_id == "dep-in-1"
    assert verified.kind == "ping"

    eng = create_engine(owner)
    try:
        with eng.connect() as conn:
            row = conn.execute(
                text("SELECT status, delivered_at FROM deployment_commands WHERE id = :id"),
                {"id": cmd_id},
            ).first()
            assert row is not None and row.status == "delivered" and row.delivered_at is not None
    finally:
        eng.dispose()

    # Rate limit: second fetch within 30 s -> 429
    r_fast = await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_in}"})
    assert r_fast.status_code == 429

    # Foreign deployment cannot report result -> 404
    r_foreign = await api.post(
        f"{API}/agent/commands/{cmd_id}/result",
        headers={"Authorization": f"Bearer {tok_eu}"},
        json={"status": "done", "result": {"ok": True}},
    )
    assert r_foreign.status_code == 404

    # Oversize result -> 413
    r_big = await api.post(
        f"{API}/agent/commands/{cmd_id}/result",
        headers={"Authorization": f"Bearer {tok_in}"},
        json={"status": "done", "result": {"pad": "a" * 4200}},
    )
    assert r_big.status_code == 413

    # Owner deployment reports result once -> 200, second time -> 409
    r_done = await api.post(
        f"{API}/agent/commands/{cmd_id}/result",
        headers={"Authorization": f"Bearer {tok_in}"},
        json={"status": "done", "result": {"pong": True}},
    )
    assert r_done.status_code == 200
    assert r_done.json() == {"id": cmd_id, "status": "done"}

    r_again = await api.post(
        f"{API}/agent/commands/{cmd_id}/result",
        headers={"Authorization": f"Bearer {tok_in}"},
        json={"status": "done", "result": {"pong": True}},
    )
    assert r_again.status_code == 409

    # Expired command gets marked expired on fetch and is not returned
    exp_id = await _enqueue_owner(owner, vault, "dep-eu-1")
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            past = datetime.now(UTC) - timedelta(minutes=20)
            conn.execute(
                text("UPDATE deployment_commands SET issued_at = :iss, expires_at = :exp WHERE id = :id"),
                {"iss": past, "exp": past + timedelta(minutes=5), "id": exp_id},
            )
    finally:
        eng.dispose()

    # Clear rate limit state on app state so dep-eu-1 can fetch again immediately
    api._transport.app.state.agent_commands_checked_at.clear()  # type: ignore[attr-defined]
    r_exp = await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_eu}"})
    assert r_exp.status_code == 200
    assert r_exp.json() == {"items": []}

    eng = create_engine(owner)
    try:
        with eng.connect() as conn:
            status = conn.execute(
                text("SELECT status FROM deployment_commands WHERE id = :id"),
                {"id": exp_id},
            ).scalar_one()
            assert status == "expired"
    finally:
        eng.dispose()


@pytest.mark.anyio
async def test_commands_auth_air_gapped_and_control_app_cannot_insert(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner, app_url = control_db

    # Missing or unknown token -> 401
    assert (await api.get(f"{API}/agent/commands")).status_code == 401
    assert (
        await api.get(f"{API}/agent/commands", headers={"Authorization": "Bearer unknown-token"})
    ).status_code == 401

    # Revoked token -> 401
    tok_rev = issue_token(owner, "dep-ct")
    revoke_token(owner, "dep-ct")
    assert (await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_rev}"})).status_code == 401

    # Air-gapped deployment -> 403
    tok_air = issue_token(owner, "dep-al")
    assert (await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_air}"})).status_code == 403
    assert (
        await api.post(
            f"{API}/agent/commands/cmd-0000000000000001/result",
            headers={"Authorization": f"Bearer {tok_air}"},
            json={"status": "done", "result": {}},
        )
    ).status_code == 403

    # control_app cannot INSERT into deployment_commands
    app_eng = create_engine(app_url)
    try:
        with pytest.raises(ProgrammingError), app_eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO deployment_commands "
                    "(id, deployment_id, kind, payload, signature, status, issued_at, expires_at) "
                    "VALUES ('cmd-0000000000000001', 'dep-in-1', 'ping', '{}', "
                    "repeat('A', 86) || '==', 'pending', now(), now() + interval '10 minutes')"
                )
            )
    finally:
        app_eng.dispose()
