"""Field encryption (NEX-050, V-2) against the in-memory Transit fake (real AES-GCM)."""

import pytest

from nexus.core.fieldcrypto import FieldCipher, FieldUnreadable
from nexus.core.vault import FakeVault, key_name

pytestmark = pytest.mark.anyio
A, B = key_name("ten-a", "field_health"), key_name("ten-b", "field_health")


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


async def ready() -> tuple[FakeVault, FieldCipher]:
    vault = FakeVault()
    await vault.create_key(A)
    await vault.create_key(B)
    return vault, FieldCipher(vault)


async def test_round_trip_and_fresh_ciphertext_each_time() -> None:
    _, cipher = await ready()
    one = await cipher.encrypt(A, "person.allergies", "பால் ஒவ்வாமை")
    two = await cipher.encrypt(A, "person.allergies", "பால் ஒவ்வாமை")
    assert one != two and one.startswith("v1:1:")
    assert await FieldCipher(cipher._vault).decrypt(A, "person.allergies", one) == "பால் ஒவ்வாமை"  # cold cache


async def test_another_tenants_key_or_field_cannot_read_it() -> None:
    _, cipher = await ready()
    sealed = await cipher.encrypt(A, "person.allergies", "nuts")
    with pytest.raises(FieldUnreadable):
        await cipher.decrypt(B, "person.allergies", sealed)
    with pytest.raises(FieldUnreadable):
        await cipher.decrypt(A, "person.idNumber", sealed)
    tampered = sealed[:-4] + ("AAAA" if not sealed.endswith("AAAA") else "BBBB")
    with pytest.raises(FieldUnreadable):
        await cipher.decrypt(A, "person.allergies", tampered)


async def test_rotation_keeps_old_values_readable() -> None:
    vault, cipher = await ready()
    old = await cipher.encrypt(A, "f", "before")
    await vault.rotate(A)
    cipher.forget(A)
    new = await cipher.encrypt(A, "f", "after")
    assert new.startswith("v1:2:")
    assert await cipher.decrypt(A, "f", old) == "before" and await cipher.decrypt(A, "f", new) == "after"


async def test_crypto_shred_makes_values_unreadable() -> None:
    vault, cipher = await ready()
    sealed = await cipher.encrypt(A, "f", "secret")
    await vault.destroy(A)
    cipher.forget(A)
    with pytest.raises(FieldUnreadable):
        await cipher.decrypt(A, "f", sealed)


async def test_blind_index_is_deterministic_normalised_and_per_field() -> None:
    _, cipher = await ready()
    one = await cipher.blind_index(A, "person.idNumber", " AB-123 ")
    assert one == await cipher.blind_index(A, "person.idNumber", "ab-123")
    assert one != await cipher.blind_index(A, "person.passport", "ab-123")
    assert one != await cipher.blind_index(B, "person.idNumber", "ab-123")
