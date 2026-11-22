"""Tenant export `NXTE/1` format tests (NEX-106, D58): FakeVault RSA wrap/unwrap, FieldCipher values, tampering."""

import io
import os
import struct
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519, rsa
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

from nexus.agent.crypto import CHUNK, BackupCorrupt, Header, encrypt_stream
from nexus.agent.tenant_export import (
    FORMAT,
    IMPORT_KEY_NAME,
    decrypt_export_rows,
    encrypt_rows,
    load_rsa_public_key,
    pem_fingerprint,
    read_export_header,
    unwrap_export_key,
)
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.vault import FakeVault, KeyDestroyed, key_name

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def _split_chunks(blob: bytes) -> tuple[bytes, list[bytes]]:
    (length,) = struct.unpack(">I", blob[5:9])
    head, rest = blob[: 9 + length], blob[9 + length :]
    parts: list[bytes] = []
    while rest:
        (n,) = struct.unpack(">I", rest[:4])
        parts.append(rest[: 4 + n])
        rest = rest[4 + n :]
    return head, parts


async def test_round_trip_with_fake_vault_and_field_values() -> None:
    src_vault, dest_vault = FakeVault(), FakeVault()
    await dest_vault.create_import_key(IMPORT_KEY_NAME)
    dest_pem = await dest_vault.public_key_pem(IMPORT_KEY_NAME)

    # Simulate a source tenant with a FieldCipher-encrypted sensitive value decrypted into the stream.
    src_key = key_name("ten-ls", "field_health")
    await src_vault.create_key(src_key)
    cipher = FieldCipher(src_vault)
    allergy_note = "பால் ஒவ்வாமை — EpiPen in clinic"
    sealed = await cipher.encrypt(src_key, "person.allergies", allergy_note)
    decrypted_note = await cipher.decrypt(src_key, "person.allergies", sealed)

    # Include a large row so the stream spans multiple 1 MB AES-GCM chunks.
    big_content = "x" * (CHUNK + 2048)
    rows: list[tuple[str, dict[str, Any]]] = [
        ("tenants", {"id": "ten-ls", "name": "Little Steps Preschool", "created_at": datetime(2026, 5, 1, tzinfo=UTC)}),
        (
            "people",
            {
                "id": "per-1",
                "tenant_id": "ten-ls",
                "legal_name": "Ananya Krishnan",
                "date_of_birth": date(2021, 3, 14),
                "allergies": decrypted_note,
                "fee_balance": Decimal("1250.50"),
                "ext_id": UUID("12345678-1234-5678-1234-567812345678"),
            },
        ),
        ("ai_chunks", {"id": "chk-1", "tenant_id": "ten-ls", "content": big_content}),
    ]
    counts = {"tenants": 1, "people": 1, "ai_chunks": 1}
    dec_meta = [{"table": "people", "column": "allergies", "purpose": "field_health", "field": "person.allergies"}]

    out = io.BytesIO()
    header, plain_size = encrypt_rows(
        out,
        export_id="exp-test-1",
        tenant_id="ten-ls",
        source_install_id="ins-src-1",
        revision="0019_install_active_users",
        dest_pem=dest_pem,
        counts=counts,
        rows=rows,
        decrypted_columns=dec_meta,
    )
    blob = out.getvalue()
    assert plain_size > CHUNK
    assert header.fields["format"] == FORMAT
    assert header.fields["tenantId"] == "ten-ls"
    assert header.fields["sourceInstallId"] == "ins-src-1"
    assert header.fields["tables"] == counts
    assert header.fields["pemSha256"] == pem_fingerprint(dest_pem)
    assert header.fields["decryptedColumns"] == dec_meta

    # Neither names nor decrypted field values appear anywhere in the raw encrypted file bytes.
    for plain in (b"Ananya Krishnan", b"Little Steps", allergy_note.encode(), b"EpiPen", sealed.encode()):
        assert plain not in blob

    # Destination unwraps the data key through its Vault and recovers every row intact.
    src = io.BytesIO(blob)
    parsed_header = read_export_header(src)
    assert parsed_header.fields == header.fields
    data_key = await unwrap_export_key(dest_vault, parsed_header)
    recovered = list(decrypt_export_rows(src, data_key, parsed_header))
    assert len(recovered) == 3
    assert recovered[0] == (
        "tenants",
        {"id": "ten-ls", "name": "Little Steps Preschool", "created_at": "2026-05-01T00:00:00Z"},
    )
    assert recovered[1][0] == "people"
    assert recovered[1][1]["legal_name"] == "Ananya Krishnan"
    assert recovered[1][1]["allergies"] == allergy_note
    assert recovered[1][1]["date_of_birth"] == "2021-03-14"
    assert recovered[1][1]["fee_balance"] == "1250.50"
    assert recovered[2] == ("ai_chunks", {"id": "chk-1", "tenant_id": "ten-ls", "content": big_content})


async def test_tampered_chunk_wrong_key_and_wrong_format_refused() -> None:
    dest_vault, other_vault = FakeVault(), FakeVault()
    await dest_vault.create_import_key(IMPORT_KEY_NAME)
    await other_vault.create_import_key(IMPORT_KEY_NAME)
    pem = await dest_vault.public_key_pem(IMPORT_KEY_NAME)

    out = io.BytesIO()
    rows = [("tenants", {"id": "ten-1"}), ("ai_chunks", {"id": "c1", "content": "a" * (CHUNK + 512)})]
    encrypt_rows(
        out,
        export_id="exp-test-2",
        tenant_id="ten-1",
        source_install_id="ins-1",
        revision="0019_install_active_users",
        dest_pem=pem,
        counts={"tenants": 1, "ai_chunks": 1},
        rows=rows,
    )
    blob = out.getvalue()
    head, parts = _split_chunks(blob)
    assert len(parts) == 2

    hdr = read_export_header(io.BytesIO(blob))
    data_key = await unwrap_export_key(dest_vault, hdr)

    # Another install's key cannot unwrap the data key.
    with pytest.raises(KeyDestroyed):
        await unwrap_export_key(other_vault, hdr)

    # Wrong AES data key cannot decrypt the stream.
    wrong_src = io.BytesIO(blob)
    wrong_hdr = read_export_header(wrong_src)
    with pytest.raises(BackupCorrupt):
        list(decrypt_export_rows(wrong_src, os.urandom(32), wrong_hdr))

    # Flipped byte, dropped chunk, swapped chunks, truncated tail all fail.
    flipped = bytearray(blob)
    flipped[len(head) + 50] ^= 0xFF
    for bad in (bytes(flipped), head + parts[0], head + parts[1] + parts[0], blob[:-10]):
        bad_src = io.BytesIO(bad)
        bad_hdr = read_export_header(bad_src)
        with pytest.raises(BackupCorrupt):
            list(decrypt_export_rows(bad_src, data_key, bad_hdr))

    # A full backup (`nexus-backup/1`) is rejected by read_export_header.
    bkp = io.BytesIO()
    encrypt_stream(bkp, os.urandom(32), Header({"format": "nexus-backup/1", "noncePrefix": "a1b2c3d4"}), [b"x"])
    with pytest.raises(BackupCorrupt):
        read_export_header(io.BytesIO(bkp.getvalue()))


async def test_small_rsa_and_non_rsa_keys_refused() -> None:
    rsa_2048 = (
        rsa.generate_private_key(public_exponent=65537, key_size=2048)
        .public_key()
        .public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    )
    ed_pub = (
        ed25519.Ed25519PrivateKey.generate().public_key().public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    )
    rsa_3072 = (
        rsa.generate_private_key(public_exponent=65537, key_size=3072)
        .public_key()
        .public_bytes(Encoding.PEM, PublicFormat.SubjectPublicKeyInfo)
    )

    with pytest.raises(ValueError, match="3072"):
        load_rsa_public_key(rsa_2048)
    with pytest.raises(ValueError, match="RSA"):
        load_rsa_public_key(ed_pub)
    with pytest.raises(ValueError, match="valid PEM"):
        load_rsa_public_key("not a key")

    # 3072-bit RSA is accepted.
    assert load_rsa_public_key(rsa_3072).key_size == 3072


async def test_rotated_import_key_still_unwraps_earlier_export() -> None:
    dest_vault = FakeVault()
    await dest_vault.create_import_key(IMPORT_KEY_NAME)
    pem_v1 = await dest_vault.public_key_pem(IMPORT_KEY_NAME)

    out = io.BytesIO()
    encrypt_rows(
        out,
        export_id="exp-rot",
        tenant_id="ten-1",
        source_install_id="ins-1",
        revision="0019_install_active_users",
        dest_pem=pem_v1,
        counts={"tenants": 1},
        rows=[("tenants", {"id": "ten-1"})],
    )
    # Rotate destination import key after handing out pem_v1.
    dest_vault.rsa[IMPORT_KEY_NAME].append(rsa.generate_private_key(public_exponent=65537, key_size=4096))
    src = io.BytesIO(out.getvalue())
    hdr = read_export_header(src)
    key = await unwrap_export_key(dest_vault, hdr)
    assert list(decrypt_export_rows(src, key, hdr)) == [("tenants", {"id": "ten-1"})]
    # Transit-formatted ciphertext `vault:v1:<b64>` is also accepted.
    assert await dest_vault.rsa_decrypt(IMPORT_KEY_NAME, f"vault:v1:{hdr.fields['wrappedKey']}") == key
