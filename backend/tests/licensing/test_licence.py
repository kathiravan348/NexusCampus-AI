import base64
import json
from datetime import date
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from pydantic import ValidationError

from nexus.core.vault import FakeVault
from nexus.licensing.canonical import canonical_json
from nexus.licensing.licence import (
    LicenceFile,
    LicenceTerms,
    fingerprint,
    issue_licence,
    key_id,
    signed_message,
    verify_licence,
)

VECTOR = Path(__file__).with_name("vector.json")
KEY = "nexus-licence"


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def terms(**over: object) -> LicenceTerms:
    base: dict[str, object] = {
        "id": "lic-al-2026",
        "accountId": "acc-al",
        "edition": "standard",
        "modules": ["M01", "M02", "M83", "M84"],
        "learnerCap": 1500,
        "campusCap": 5,
        "issuedAt": "2026-01-10T00:00:00Z",
        "expiresAt": "2027-01-09",
        "supportEndsAt": "2027-01-09",
        "graceDays": 30,
        "activation": "offline",
        "signingKeyId": "pending",
    }
    base.update(over)
    return LicenceTerms.model_validate(base)


async def issued(vault: FakeVault, **over: object) -> tuple[LicenceFile, dict[str, bytes]]:
    file = await issue_licence(terms(**over), vault, KEY)
    keys = {key_id(KEY, v): raw for v, raw in (await vault.public_keys(KEY)).items()}
    return file, keys


def test_canonical_json_is_stable_and_refuses_floats() -> None:
    assert canonical_json({"b": 1, "a": ["x", None, True]}) == b'{"a":["x",null,true],"b":1}'
    assert canonical_json({"t": "தமிழ்"}) == '{"t":"தமிழ்"}'.encode()
    with pytest.raises(TypeError):
        canonical_json({"x": 1.5})


@pytest.mark.anyio
async def test_issue_and_verify_round_trip() -> None:
    vault = FakeVault()
    file, keys = await issued(vault)
    assert file.payload.signing_key_id == "nexus-licence:v1"
    loaded = LicenceFile.model_validate_json(file.to_json())
    check = verify_licence(loaded, keys, date(2026, 6, 1))
    assert (check.valid, check.state) == (True, "active")
    assert len(fingerprint(file)) == 64


@pytest.mark.anyio
async def test_tampering_unknown_key_and_wrong_key_fail() -> None:
    vault = FakeVault()
    file, keys = await issued(vault)
    more = file.model_copy(update={"payload": file.payload.model_copy(update={"learner_cap": 99_999})})
    assert verify_licence(more, keys, date(2026, 6, 1)).problem == "bad_signature"
    assert verify_licence(file, {}, date(2026, 6, 1)).problem == "unknown_key"
    other = Ed25519PrivateKey.generate().public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    assert verify_licence(file, {file.payload.signing_key_id: other}, date(2026, 6, 1)).problem == ("bad_signature")


@pytest.mark.anyio
async def test_rotation_keeps_old_licences_valid() -> None:
    vault = FakeVault()
    old, _ = await issued(vault)
    vault.signing[KEY].append(Ed25519PrivateKey.generate())
    new, keys = await issued(vault)
    assert new.payload.signing_key_id == "nexus-licence:v2"
    assert verify_licence(old, keys, date(2026, 6, 1)).valid
    assert verify_licence(new, keys, date(2026, 6, 1)).valid


@pytest.mark.anyio
async def test_states_expiry_grace_read_only_and_perpetual() -> None:
    vault = FakeVault()
    file, keys = await issued(vault)
    assert verify_licence(file, keys, date(2027, 1, 9)).state == "active"
    grace = verify_licence(file, keys, date(2027, 1, 20))
    assert (grace.state, grace.grace_ends_on) == ("grace", date(2027, 2, 8))
    assert verify_licence(file, keys, date(2027, 2, 9)).state == "read_only"
    perpetual, keys = await issued(vault, expiresAt=None)
    assert verify_licence(perpetual, keys, date(2040, 1, 1)).state == "active"


def test_terms_are_checked() -> None:
    with pytest.raises(ValidationError):
        terms(modules=["M01", "M01"])
    with pytest.raises(ValidationError):
        terms(expiresAt="2025-12-31")
    with pytest.raises(ValidationError):
        terms(extra="field")


def build_vector() -> dict[str, object]:
    """A fixed key (seed 0..31) and fixed terms: Ed25519 is deterministic, so the file never changes."""
    private = Ed25519PrivateKey.from_private_bytes(bytes(range(32)))
    signed = terms(signingKeyId=key_id(KEY, 1))
    file = LicenceFile(payload=signed, signature=base64.b64encode(private.sign(signed_message(signed))).decode())
    public = private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
    return {
        "publicKey": base64.b64encode(public).decode(),
        "file": json.loads(file.to_json()),
        "fingerprint": fingerprint(file),
    }


def test_shared_vector_matches_and_verifies() -> None:
    """`vector.json` is also parsed by the frontend contract test (`licenceVector.test.ts`)."""
    vector = build_vector()
    assert json.loads(VECTOR.read_text(encoding="utf-8")) == vector
    file = LicenceFile.model_validate(vector["file"])
    keys = {file.payload.signing_key_id: base64.b64decode(str(vector["publicKey"]))}
    assert verify_licence(file, keys, date(2026, 6, 1)).valid
