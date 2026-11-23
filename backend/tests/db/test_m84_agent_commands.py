"""DB tests for `agent_commands` replay table and `nexus_app` grants (D60, NEX-129)."""

import json
import secrets
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

from nexus.agent.commands import COMMAND_KEYS, poll_commands
from nexus.commands.format import DEFAULT_KEY, CommandPayload, new_command_id, public_key_file, sign_command
from nexus.core.vault import FakeVault
from nexus.settings import Settings
from tests.db.conftest import DbUrls


@pytest.mark.anyio
async def test_agent_commands_replay_and_nexus_app_grants(test_db: DbUrls, tmp_path: Path) -> None:
    vault = FakeVault()
    now = datetime.now(UTC).replace(microsecond=0)
    cid = new_command_id()
    cmd = CommandPayload(
        id=cid,
        deployment_id="dep-in-1",
        tenant_id=None,
        kind="ping",
        args={},
        issued_at=now.isoformat().replace("+00:00", "Z"),
        expires_at=(now + timedelta(minutes=10)).isoformat().replace("+00:00", "Z"),
        issued_by="cli",
        signing_key_id=f"{DEFAULT_KEY}:v0",
    )
    raw, sig = await sign_command(vault, DEFAULT_KEY, cmd)
    (tmp_path / COMMAND_KEYS).write_text(json.dumps(await public_key_file(vault, DEFAULT_KEY)), encoding="utf-8")

    posted: list[dict[str, Any]] = []

    def handler(req: httpx2.Request) -> httpx2.Response:
        if req.method == "GET":
            return httpx2.Response(200, json={"items": [{"command": raw, "signature": sig}]})
        posted.append(json.loads(req.content))
        return httpx2.Response(200, json={"id": cid, "status": "done"})

    cfg = Settings(
        install_mode="self_hosted",
        agent_commands="on",
        deployment_id="dep-in-1",
        install_dir=tmp_path,
        control_url="https://control.nexuscampus.example",
        control_agent_token=SecretStr(secrets.token_urlsafe(16)),
        app_version="2.4.1",
        air_gapped=False,
    )

    app_eng = create_engine(test_db.app_url)
    try:
        res1 = poll_commands(app_eng, cfg, now=now + timedelta(seconds=1), transport=httpx2.MockTransport(handler))
        assert res1.done == 1 and len(posted) == 1

        # Second poll skips replay via Postgres PK
        res2 = poll_commands(app_eng, cfg, now=now + timedelta(seconds=2), transport=httpx2.MockTransport(handler))
        assert res2.skipped == 1 and res2.done == 0 and len(posted) == 1

        with app_eng.connect() as conn:
            row = conn.execute(
                text("SELECT status, finished_at FROM agent_commands WHERE id = :id"), {"id": cid}
            ).first()
            assert row is not None and row.status == "done" and row.finished_at is not None

        # nexus_app cannot DELETE or overwrite `kind`
        with pytest.raises(ProgrammingError), app_eng.begin() as conn:
            conn.execute(text("DELETE FROM agent_commands WHERE id = :id"), {"id": cid})
        with pytest.raises(ProgrammingError), app_eng.begin() as conn:
            conn.execute(text("UPDATE agent_commands SET kind = 'other' WHERE id = :id"), {"id": cid})
    finally:
        app_eng.dispose()
