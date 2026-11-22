"""Backup encryption (NEX-112): every tampering is detected. Diagnostics scrubber: personal data never survives."""

import io
import os
import struct

import pytest

from nexus.agent.crypto import CHUNK, BackupCorrupt, Header, decrypt_stream, encrypt_stream, read_header
from nexus.agent.diagnostics import scrub

KEY = os.urandom(32)
DATA = os.urandom(CHUNK * 2 + 12345)  # three chunks


def header(**over: object) -> Header:
    return Header({"format": "nexus-backup/1", "id": "bkp-1", "noncePrefix": "a1b2c3d4", **over})


def encrypted(data: bytes = DATA, h: Header | None = None) -> bytes:
    out = io.BytesIO()
    encrypt_stream(out, KEY, h or header(), [data[i : i + 7000] for i in range(0, len(data), 7000)])
    return out.getvalue()


def decrypt(blob: bytes, key: bytes = KEY) -> bytes:
    src = io.BytesIO(blob)
    h = read_header(src)
    return b"".join(decrypt_stream(src, key, h))


def chunks(blob: bytes) -> tuple[bytes, list[bytes]]:
    (length,) = struct.unpack(">I", blob[5:9])
    head, rest = blob[: 9 + length], blob[9 + length :]
    parts = []
    while rest:
        (n,) = struct.unpack(">I", rest[:4])
        parts.append(rest[: 4 + n])
        rest = rest[4 + n :]
    return head, parts


def test_round_trip_including_empty() -> None:
    assert decrypt(encrypted()) == DATA
    assert decrypt(encrypted(b"")) == b""
    assert DATA[:100] not in encrypted()  # no plain data in the file


def test_every_tampering_is_refused() -> None:
    blob = encrypted()
    head, parts = chunks(blob)
    assert len(parts) == 3
    flipped = bytearray(blob)
    flipped[len(head) + 100] ^= 1
    for bad in (
        bytes(flipped),  # changed byte
        head + parts[0] + parts[1],  # last chunk dropped
        head + parts[1] + parts[0] + parts[2],  # chunks swapped
        chunks(encrypted(h=header(id="bkp-2")))[0] + b"".join(parts),  # another file's header
        blob[:-5],  # cut short
    ):
        with pytest.raises(BackupCorrupt):
            decrypt(bad)
    with pytest.raises(BackupCorrupt):
        decrypt(blob, os.urandom(32))  # wrong key
    with pytest.raises(BackupCorrupt):
        decrypt(b"PK\x03\x04 not a backup")


def test_scrub_removes_personal_data_and_secrets() -> None:
    line = (
        "user priya.raman@littlesteps.example.edu from 10.0.12.7 called +91 98765 43210;"
        " Authorization: Bearer abc.def.ghi password=hunter2 key 3f8a9c0e1d2b4a5f6e7d8c9b0a1f2e3d"
        " token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U"
        " admission 2026004512 kept: 404 status, 2.4.1 version"
    )
    out = scrub(line)
    for secret in (
        "priya.raman",
        "10.0.12.7",
        "98765",
        "hunter2",
        "abc.def.ghi",
        "3f8a9c0e1d2b4a5f6e7d8c9b0a1f2e3d",
        "eyJhbGci",
        "2026004512",
    ):
        assert secret not in out, secret
    assert "404 status" in out and "2.4.1 version" in out


def test_scrub_keeps_timestamps_readable() -> None:
    line = "2026-11-22 08:00:01 INFO sign-in ok for a.b@example.org; call +44 20 7946 0958"
    out = scrub(line)
    assert out.startswith("2026-11-22 08:00:01 INFO")
    assert "a.b@example.org" not in out and "7946" not in out
