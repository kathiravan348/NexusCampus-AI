"""Key status API and crypto-shred (NEX-050); real Vault smoke test when the dev container runs."""

from collections.abc import AsyncIterator

import httpx2
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from nexus.core.fieldcrypto import FieldCipher, FieldUnreadable
from nexus.core.hashchain import verify_chain
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.core.vault import FakeVault, HttpVault, KeyDestroyed
from nexus.modules.m83.keys import destroy_tenant_keys, provision_key
from nexus.settings import get_settings
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
AX = TenantContext("ten-ax")


def test_keys_show_metadata_only(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    page = client.get("/api/v1/vault/keys").json()
    assert page["total"] == 1
    key = page["items"][0]
    assert set(key) == {"id", "tenantId", "purpose", "custody", "status", "createdAt", "rotatedAt"}
    assert (key["purpose"], key["custody"], key["status"]) == ("tenant_data", "platform", "active")


def test_teachers_cannot_see_keys(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    assert client.get("/api/v1/vault/keys").status_code == 403


@pytest.fixture
async def app_sessions(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine: AsyncEngine = create_async_engine(test_db.app_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


@pytest.mark.anyio
async def test_crypto_shred_keeps_the_audit_chain_valid(app_sessions: async_sessionmaker[AsyncSession]) -> None:
    vault, cipher = FakeVault(), None
    cipher = FieldCipher(vault)
    async with app_sessions() as s, s.begin():
        await bind_tenant(s, AX)
        name = await provision_key(s, AX, vault, purpose="field_health")
    sealed = await cipher.encrypt(name, "person.allergies", "peanuts")
    async with app_sessions() as s, s.begin():
        await bind_tenant(s, AX)
        await vault.create_key("tenant-ten-ax-tenant-data")  # the seeded key row's Transit key
        assert await destroy_tenant_keys(s, AX, vault, cipher) == 2
        assert (await verify_chain(s, AX.tenant_id)).ok
    with pytest.raises(FieldUnreadable):
        await cipher.decrypt(name, "person.allergies", sealed)


def _real_vault_ready() -> bool:
    s = get_settings()
    if not s.vault_token.get_secret_value():
        return False
    try:
        return httpx2.get(f"{s.vault_url}/v1/sys/health", timeout=2).status_code == 200
    except httpx2.HTTPError:
        return False


@pytest.mark.anyio
async def test_real_vault_transit_round_trip() -> None:
    if not _real_vault_ready():
        pytest.skip("dev Vault not running (uv run --project backend nexus-compose-up)")
    async with httpx2.AsyncClient(timeout=10) as http:
        vault = HttpVault(get_settings(), http)
        name = "tenant-test-field-health"
        await vault.create_key(name)
        cipher = FieldCipher(vault)
        sealed = await cipher.encrypt(name, "f", "ok")
        assert await FieldCipher(vault).decrypt(name, "f", sealed) == "ok"
        assert len(await vault.hmac(name, "x")) > 20
        await vault.rotate(name)
        assert (await vault.info(name)).latest_version == 2
        await vault.destroy(name)
        with pytest.raises(KeyDestroyed):
            await vault.data_key(name)
