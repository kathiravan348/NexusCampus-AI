"""Assist guards (NEX-058): the mock's reasons (`ai_off`, `consent`, module off), settings rules, minors."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.modules.m11.pipeline import missing_minor_consent
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import owner_sql
from tests.db.m11.helpers import ASK, MEENA, TAMIL_QUESTION, as_karthik, csrf, fake_ai, sessions  # noqa: F401
from tests.fake_keycloak import FakeKeycloak

SETTINGS = "/api/v1/ai/settings"


def test_settings_round_trip_and_ai_off(client: TestClient, kc: FakeKeycloak) -> None:
    provider = fake_ai(client)
    as_karthik(client, kc)
    current = client.get(SETTINGS).json()
    assert current["piiRedaction"] is True and {"M61", "M83"} <= set(current["blockedModules"])
    assert "key" not in str(current).lower()
    body = {k: current[k] for k in ("modules", "safeguardingEnabled", "defaultTier")}
    off = client.put(SETTINGS, json={**body, "enabled": False}, headers=csrf(client))
    assert off.status_code == 200 and off.json()["enabled"] is False
    refused = client.post(ASK, json=TAMIL_QUESTION, headers=csrf(client))
    assert refused.status_code == 403 and refused.json()["error"]["details"][0]["path"] == "ai_off"
    assert provider.calls == []
    assert client.put(SETTINGS, json={**body, "enabled": True}, headers=csrf(client)).status_code == 200


def test_health_vault_and_safeguarding_rules(client: TestClient, kc: FakeKeycloak) -> None:
    as_karthik(client, kc)
    current = client.get(SETTINGS).json()
    base = {"enabled": True, "safeguardingEnabled": False, "defaultTier": current["defaultTier"]}
    bad = client.put(SETTINGS, json={**base, "modules": {"M61": True, "M83": True, "M62": True}}, headers=csrf(client))
    assert bad.status_code == 400
    assert {d["path"] for d in bad.json()["error"]["details"]} == {"modules.M61", "modules.M83", "modules.M62"}


def test_settings_need_the_right_permission(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **MEENA)
    assert client.get(SETTINGS).status_code == 200  # assist users see the switch
    assert client.get("/api/v1/ai/credits").status_code == 403


def test_tenant_without_ai_in_its_plan_switch(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)  # Little Steps: M11 switched off
    res = client.post(ASK, json=TAMIL_QUESTION, headers=csrf(client))
    assert res.status_code == 403 and res.json()["error"]["code"] == "module_disabled"


@pytest.mark.anyio
async def test_minor_without_guardian_consent(
    sessions: async_sessionmaker[AsyncSession],  # noqa: F811
    test_db: DbUrls,
) -> None:
    owner_sql(
        test_db.owner_url,
        "INSERT INTO people (id, tenant_id, legal_name, is_minor, retention_state, created_at, updated_at) "
        "VALUES ('per-ls-test-minor', 'ten-ls', 'Test Minor', true, 'active', now(), now()) ON CONFLICT DO NOTHING",
    )
    async with sessions() as s, s.begin():
        await bind_tenant(s, TenantContext("ten-ls"))  # an early-years institution
        assert await missing_minor_consent(s, "per-ls-test-minor") is True
        assert await missing_minor_consent(s, "per-ls-kavya") is False  # consent granted
        assert await missing_minor_consent(s, "per-ls-priya") is False  # an adult
