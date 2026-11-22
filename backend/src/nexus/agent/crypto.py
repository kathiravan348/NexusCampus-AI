"""Streaming authenticated encryption for backups (NEX-112): AES-256-GCM in chunks.

File layout: `NXBK` · version (1 byte) · header length (4 bytes, big-endian) · header JSON (not secret: id, times,
schema revision, vault key name, the *wrapped* data key, nonce prefix) · then chunks, each `length (4) · ciphertext`.

Each chunk uses nonce = 4-byte random prefix + 8-byte counter, and associated data = header digest · counter · "last"
flag. So a changed byte, a chunk dropped from the end, chunks swapped or a header swapped onto another file all fail
the tag check. The plaintext data key exists only in memory.
"""

import hashlib
import json
import os
import struct
from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from typing import Any, BinaryIO

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"NXBK"
VERSION = 1
CHUNK = 1024 * 1024


class BackupCorrupt(Exception):
    """The file is not a backup, was changed, truncated or reordered, or the key is wrong."""


@dataclass(frozen=True)
class Header:
    fields: dict[str, Any]

    def encoded(self) -> bytes:
        return json.dumps(self.fields, sort_keys=True, separators=(",", ":")).encode()

    def digest(self) -> bytes:
        return hashlib.sha256(self.encoded()).digest()


def _aad(header: Header, index: int, last: bool) -> bytes:
    return header.digest() + struct.pack(">QB", index, 1 if last else 0)


def _nonce(prefix: bytes, index: int) -> bytes:
    return prefix + struct.pack(">Q", index)


def new_nonce_prefix() -> str:
    return os.urandom(4).hex()


def _chunks(data: Iterable[bytes]) -> Iterator[bytes]:
    """Re-chunks any byte stream into CHUNK-sized pieces (the last one may be shorter or empty)."""
    buffer = bytearray()
    for piece in data:
        buffer += piece
        while len(buffer) >= CHUNK:
            yield bytes(buffer[:CHUNK])
            del buffer[:CHUNK]
    yield bytes(buffer)


def encrypt_stream(out: BinaryIO, key: bytes, header: Header, data: Iterable[bytes]) -> int:
    """Writes the encrypted file; returns the number of plaintext bytes."""
    aes, prefix = AESGCM(key), bytes.fromhex(header.fields["noncePrefix"])
    encoded = header.encoded()
    out.write(MAGIC + bytes([VERSION]) + struct.pack(">I", len(encoded)) + encoded)
    total, index, pending = 0, 0, None
    for chunk in _chunks(data):
        if pending is not None:
            sealed = aes.encrypt(_nonce(prefix, index), pending, _aad(header, index, False))
            out.write(struct.pack(">I", len(sealed)) + sealed)
            index += 1
        pending = chunk
        total += len(chunk)
    sealed = aes.encrypt(_nonce(prefix, index), pending or b"", _aad(header, index, True))
    out.write(struct.pack(">I", len(sealed)) + sealed)
    return total


def read_header(src: BinaryIO) -> Header:
    head = src.read(9)
    if len(head) != 9 or head[:4] != MAGIC or head[4] != VERSION:
        raise BackupCorrupt("not a NexusCampus backup")
    (length,) = struct.unpack(">I", head[5:9])
    if length > 64 * 1024:
        raise BackupCorrupt("header too large")
    try:
        return Header(json.loads(src.read(length)))
    except ValueError as exc:
        raise BackupCorrupt("unreadable header") from exc


def decrypt_stream(src: BinaryIO, key: bytes, header: Header) -> Iterator[bytes]:
    """Yields verified plaintext chunks; raises `BackupCorrupt` on any change, truncation or wrong key."""
    aes, prefix = AESGCM(key), bytes.fromhex(header.fields["noncePrefix"])
    index = 0
    current = _read_sealed(src)
    if current is None:
        raise BackupCorrupt("no data")
    while True:
        following = _read_sealed(src)
        last = following is None
        try:
            yield aes.decrypt(_nonce(prefix, index), current, _aad(header, index, last))
        except InvalidTag as exc:
            raise BackupCorrupt(f"chunk {index} failed its check (changed, reordered, truncated or wrong key)") from exc
        if following is None:
            return
        current, index = following, index + 1


def _read_sealed(src: BinaryIO) -> bytes | None:
    size = src.read(4)
    if not size:
        return None
    if len(size) != 4:
        raise BackupCorrupt("truncated chunk length")
    (length,) = struct.unpack(">I", size)
    if length > CHUNK + 64:
        raise BackupCorrupt("chunk too large")
    sealed = src.read(length)
    if len(sealed) != length:
        raise BackupCorrupt("truncated chunk")
    return sealed
