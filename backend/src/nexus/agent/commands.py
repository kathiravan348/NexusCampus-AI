"""Agent side of Control -> deployment signed commands (D60, NEX-129).

Polls `GET /control/api/v1/agent/commands` through `control_endpoint` (HTTPS only, loopback HTTP in dev, no redirects,
<= 64 KB), verifies each `nexus-command/1` signature against `install_dir/command-keys.json`, checks deployment id and
replay table `agent_commands`, executes allowed kinds (`ping` here), and reports results back to Control.
"""

import json
import logging
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import httpx2
from sqlalchemy import Engine, text

from nexus.agent.health import control_endpoint
from nexus.agent.licence import load_keys
from nexus.commands.format import CommandPayload, CommandVerificationError, verify_command
from nexus.settings import Settings

COMMAND_KEYS = "command-keys.json"
COMMANDS_ENDPOINT_PATH = "/control/api/v1/agent/commands"
COMMAND_TIMEOUT_SECONDS = 10.0
MAX_RESPONSE_BYTES = 65536
_SAFE_CMD_ID = re.compile(r"^cmd-[0-9a-f]{16}$")

log = logging.getLogger("nexus.agent.commands")

CommandHandler = Callable[[CommandPayload, Engine, Settings], dict[str, Any]]


@dataclass(frozen=True)
class CommandsRunResult:
    fetched: int
    done: int
    failed: int
    rejected: int
    skipped: int
    message: str


def _handle_ping(_cmd: CommandPayload, _engine: Engine, settings: Settings) -> dict[str, Any]:
    return {"version": settings.app_version}


HANDLERS: dict[str, CommandHandler] = {"ping": _handle_ping}


def commands_skip_reason(settings: Settings) -> str | None:
    """Returns a one-line reason when command polling must not contact Control, else None."""
    if settings.air_gapped:
        return "skipped: air-gapped install"
    if not settings.agent_commands_enabled:
        return "skipped: commands are off"
    if not settings.deployment_id.strip():
        return "skipped: no deployment id configured"
    if not settings.control_agent_token.get_secret_value().strip():
        return "skipped: no agent token configured"
    if not (settings.install_dir / COMMAND_KEYS).exists():
        return "skipped: no pinned command keys"
    return None


def _extract_safe_id(raw: Any) -> str | None:
    if not isinstance(raw, str):
        return None
    try:
        parsed = json.loads(raw)
    except ValueError:
        return None
    if isinstance(parsed, dict) and isinstance(parsed.get("id"), str) and _SAFE_CMD_ID.match(parsed["id"]):
        return str(parsed["id"])
    return None


def _post_result(
    client: httpx2.Client,
    base_url: str,
    token: str,
    cmd_id: str,
    status: str,
    result: dict[str, Any],
) -> None:
    url = control_endpoint(base_url, f"{COMMANDS_ENDPOINT_PATH}/{cmd_id}/result")
    if url is None:
        return
    try:
        client.post(
            url,
            json={"status": status, "result": result},
            headers={"Authorization": f"Bearer {token}"},
        )
    except httpx2.HTTPError:
        log.info("agent command report command=%s status=%s outcome=network_error", cmd_id, status)


def _claim_command(engine: Engine, cmd_id: str, kind: str, now: datetime) -> bool:
    """Inserts `cmd_id` into `agent_commands`; returns False if this id was already seen (replay guard)."""
    with engine.begin() as conn:
        inserted = conn.execute(
            text(
                "INSERT INTO agent_commands (id, kind, received_at, status) "
                "VALUES (:id, :kind, :now, 'running') "
                "ON CONFLICT (id) DO NOTHING RETURNING id"
            ),
            {"id": cmd_id, "kind": kind, "now": now},
        ).first()
    return inserted is not None


def _finish_command(engine: Engine, cmd_id: str, status: str, now: datetime) -> None:
    with engine.begin() as conn:
        conn.execute(
            text("UPDATE agent_commands SET status = :status, finished_at = :now WHERE id = :id"),
            {"id": cmd_id, "status": status, "now": now},
        )


def poll_commands(
    engine: Engine | None,
    settings: Settings,
    *,
    now: datetime | None = None,
    transport: httpx2.BaseTransport | None = None,
    handlers: dict[str, CommandHandler] | None = None,
) -> CommandsRunResult:
    """Fetches, verifies, executes once, and reports signed Control commands. Never raises."""
    skip = commands_skip_reason(settings)
    if skip is not None:
        return CommandsRunResult(0, 0, 0, 0, 0, skip)
    endpoint = control_endpoint(settings.control_url, COMMANDS_ENDPOINT_PATH)
    if endpoint is None:
        return CommandsRunResult(
            0, 0, 0, 0, 0, "failed: invalid control URL (https required, http only on this machine)"
        )
    if engine is None:
        return CommandsRunResult(0, 0, 0, 0, 0, "failed: no database connection")

    try:
        keys = load_keys(settings.install_dir / COMMAND_KEYS)
    except (OSError, ValueError):
        return CommandsRunResult(0, 0, 0, 0, 0, "skipped: unreadable pinned command keys")
    if not keys:
        return CommandsRunResult(0, 0, 0, 0, 0, "skipped: no pinned command keys")

    token = settings.control_agent_token.get_secret_value().strip()
    active_handlers = HANDLERS if handlers is None else handlers
    client = (
        httpx2.Client(timeout=COMMAND_TIMEOUT_SECONDS, verify=True, follow_redirects=False, transport=transport)
        if transport is not None
        else httpx2.Client(timeout=COMMAND_TIMEOUT_SECONDS, verify=True, follow_redirects=False)
    )
    try:
        with client:
            try:
                response = client.get(endpoint, headers={"Authorization": f"Bearer {token}"})
            except httpx2.TimeoutException:
                return CommandsRunResult(0, 0, 0, 0, 0, "failed: control timed out")
            except httpx2.ConnectError:
                return CommandsRunResult(0, 0, 0, 0, 0, "failed: could not reach control")
            except httpx2.HTTPError as exc:
                return CommandsRunResult(0, 0, 0, 0, 0, f"failed: network error ({type(exc).__name__})")

            status_code = response.status_code
            if 300 <= status_code < 400:
                return CommandsRunResult(0, 0, 0, 0, 0, f"refused: control redirected (HTTP {status_code})")
            if status_code == 401:
                return CommandsRunResult(0, 0, 0, 0, 0, "rejected (401): agent token invalid or revoked")
            if status_code == 403:
                return CommandsRunResult(0, 0, 0, 0, 0, "rejected (403): deployment is air-gapped on Control")
            if status_code == 429:
                return CommandsRunResult(0, 0, 0, 0, 0, "rate limited (429): wait 30s before next poll")
            if status_code != 200:
                return CommandsRunResult(0, 0, 0, 0, 0, f"failed: control answered HTTP {status_code}")

            raw_body = response.content
            if len(raw_body) > MAX_RESPONSE_BYTES:
                return CommandsRunResult(0, 0, 0, 0, 0, "refused: command list exceeds 64 KB")
            try:
                payload = json.loads(raw_body.decode("utf-8"))
            except (UnicodeDecodeError, ValueError):
                return CommandsRunResult(0, 0, 0, 0, 0, "failed: control answered with invalid JSON")
            items = payload.get("items") if isinstance(payload, dict) else None
            if not isinstance(items, list):
                return CommandsRunResult(0, 0, 0, 0, 0, "failed: invalid command list from control")

            done = failed = rejected = skipped = 0
            expected_dep = settings.deployment_id.strip()
            check_now = (now or datetime.now(UTC)).astimezone(UTC)

            for entry in items:
                raw_cmd = entry.get("command") if isinstance(entry, dict) else None
                sig = entry.get("signature") if isinstance(entry, dict) else None
                safe_id = _extract_safe_id(raw_cmd)

                if not isinstance(raw_cmd, str) or not isinstance(sig, str):
                    rejected += 1
                    log.info("agent command id=%s outcome=rejected reason=malformed", safe_id or "-")
                    if safe_id is not None:
                        _post_result(client, settings.control_url, token, safe_id, "rejected", {"reason": "malformed"})
                    continue

                try:
                    cmd = verify_command(raw_cmd, sig, keys, now=check_now)
                except CommandVerificationError as exc:
                    rejected += 1
                    log.info("agent command id=%s outcome=rejected reason=%s", safe_id or "-", exc.code)
                    if safe_id is not None:
                        _post_result(client, settings.control_url, token, safe_id, "rejected", {"reason": exc.code})
                    continue

                if cmd.deployment_id != expected_dep:
                    rejected += 1
                    log.info("agent command id=%s outcome=rejected reason=wrong_deployment", cmd.id)
                    _post_result(
                        client, settings.control_url, token, cmd.id, "rejected", {"reason": "wrong_deployment"}
                    )
                    continue

                if not _claim_command(engine, cmd.id, cmd.kind, check_now):
                    skipped += 1
                    log.info("agent command id=%s kind=%s outcome=skipped_replay", cmd.id, cmd.kind)
                    continue

                handler = active_handlers.get(cmd.kind)
                if handler is None:
                    rejected += 1
                    _finish_command(engine, cmd.id, "rejected", datetime.now(UTC))
                    log.info("agent command id=%s kind=%s outcome=rejected reason=unknown_kind", cmd.id, cmd.kind)
                    _post_result(client, settings.control_url, token, cmd.id, "rejected", {"reason": "unknown_kind"})
                    continue

                try:
                    result = handler(cmd, engine, settings)
                except Exception as exc:
                    failed += 1
                    _finish_command(engine, cmd.id, "failed", datetime.now(UTC))
                    log.info("agent command id=%s kind=%s outcome=failed err=%s", cmd.id, cmd.kind, type(exc).__name__)
                    _post_result(client, settings.control_url, token, cmd.id, "failed", {"error": type(exc).__name__})
                    continue

                done += 1
                _finish_command(engine, cmd.id, "done", datetime.now(UTC))
                log.info("agent command id=%s kind=%s outcome=done", cmd.id, cmd.kind)
                _post_result(client, settings.control_url, token, cmd.id, "done", result)

            msg = (
                f"{len(items)} fetched: {done} done, {failed} failed, {rejected} rejected, {skipped} skipped"
                if items
                else "no pending commands"
            )
            return CommandsRunResult(len(items), done, failed, rejected, skipped, msg)
    except Exception as exc:
        return CommandsRunResult(0, 0, 0, 0, 0, f"failed: unexpected error ({type(exc).__name__})")
