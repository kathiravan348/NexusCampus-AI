"""Unit tests for `nexus-command/1` signing and verification (D60, NEX-128)."""

import json
from datetime import UTC, datetime, timedelta

import pytest

from nexus.commands.format import (
    DEFAULT_KEY,
    CommandPayload,
    CommandVerificationError,
    load_public_keys,
    new_command_id,
    public_key_file,
    sign_command,
    verify_command,
)
from nexus.core.vault import FakeVault


def _utc(dt: datetime) -> str:
    return dt.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _sample(now: datetime, ttl: timedelta = timedelta(minutes=10), **overrides: object) -> CommandPayload:
    data: dict[str, object] = {
        "id": new_command_id(),
        "deploymentId": "dep-in-1",
        "tenantId": None,
        "kind": "ping",
        "args": {},
        "issuedAt": _utc(now),
        "expiresAt": _utc(now + ttl),
        "issuedBy": "cli",
        "signingKeyId": f"{DEFAULT_KEY}:v0",
    }
    data.update(overrides)
    return CommandPayload.model_validate(data)


@pytest.mark.anyio
async def test_sign_and_verify_round_trip() -> None:
    vault = FakeVault()
    now = datetime(2026, 11, 23, 10, 0, 0, tzinfo=UTC)
    cmd = _sample(now)
    raw, sig = await sign_command(vault, DEFAULT_KEY, cmd)
    keys = load_public_keys(await public_key_file(vault, DEFAULT_KEY))

    verified = verify_command(raw, sig, keys, now=now + timedelta(minutes=1))
    assert verified.id == cmd.id
    assert verified.deployment_id == "dep-in-1"
    assert verified.kind == "ping"
    assert verified.signing_key_id == f"{DEFAULT_KEY}:v1"


@pytest.mark.anyio
async def test_verify_refuses_tampering_wrong_key_expired_ttl_and_format() -> None:
    vault = FakeVault()
    other_vault = FakeVault()
    now = datetime(2026, 11, 23, 10, 0, 0, tzinfo=UTC)
    cmd = _sample(now, ttl=timedelta(minutes=10))
    raw, sig = await sign_command(vault, DEFAULT_KEY, cmd)
    keys = load_public_keys(await public_key_file(vault, DEFAULT_KEY))

    # Tampered payload
    tampered = raw.replace('"dep-in-1"', '"dep-eu-1"')
    with pytest.raises(CommandVerificationError) as exc:
        verify_command(tampered, sig, keys, now=now)
    assert exc.value.code == "bad_signature"

    # Non-canonical whitespace tamper
    with pytest.raises(CommandVerificationError) as exc:
        verify_command(raw + " ", sig, keys, now=now)
    assert exc.value.code == "non_canonical"

    # Other key
    await other_vault.create_signing_key(DEFAULT_KEY)
    other_keys = load_public_keys(await public_key_file(other_vault, DEFAULT_KEY))
    with pytest.raises(CommandVerificationError) as exc:
        verify_command(raw, sig, other_keys, now=now)
    assert exc.value.code == "bad_signature"

    # Unknown key
    with pytest.raises(CommandVerificationError) as exc:
        verify_command(raw, sig, {}, now=now)
    assert exc.value.code == "unknown_key"

    # Expired
    with pytest.raises(CommandVerificationError) as exc:
        verify_command(raw, sig, keys, now=now + timedelta(minutes=10))
    assert exc.value.code == "expired"

    # Unknown format
    bad_fmt = json.dumps({**json.loads(raw), "format": "nexus-command/99"}, sort_keys=True, separators=(",", ":"))
    with pytest.raises(CommandVerificationError) as exc:
        verify_command(bad_fmt, sig, keys, now=now)
    assert exc.value.code == "wrong_format"

    # TTL over 24 h refused at sign and verify
    too_long = _sample(now, ttl=timedelta(hours=24, seconds=1))
    with pytest.raises(CommandVerificationError) as exc:
        await sign_command(vault, DEFAULT_KEY, too_long)
    assert exc.value.code == "ttl_exceeded"

    bad_ttl_raw = json.dumps(
        {**json.loads(raw), "expiresAt": _utc(now + timedelta(hours=25))},
        sort_keys=True,
        separators=(",", ":"),
    )
    with pytest.raises(CommandVerificationError) as exc:
        verify_command(bad_ttl_raw, sig, keys, now=now)
    assert exc.value.code == "ttl_exceeded"

    # Oversize args refused
    big_args = _sample(now, args={"pad": "x" * 2100})
    with pytest.raises(CommandVerificationError) as exc:
        await sign_command(vault, DEFAULT_KEY, big_args)
    assert exc.value.code == "args_too_large"
