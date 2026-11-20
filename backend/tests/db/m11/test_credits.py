"""AI credits (NEX-058, A-1): hard cap → 429 `credits`; the last credits are capped, never overspent."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from tests.db.conftest import DbUrls
from tests.db.m04.helpers import owner_sql
from tests.db.m11.helpers import ASK, TAMIL_QUESTION, as_karthik, csrf, fake_ai
from tests.fake_keycloak import FakeKeycloak

LATEST = "(SELECT max(period_start) FROM ai_credits WHERE tenant_id = 'ten-ax')"


@pytest.fixture
def restore_credits(test_db: DbUrls) -> Iterator[None]:
    query = f"SELECT used FROM ai_credits WHERE tenant_id = 'ten-ax' AND period_start = {LATEST}"  # noqa: S608
    used = owner_sql(test_db.owner_url, query)
    yield
    owner_sql(
        test_db.owner_url,
        f"UPDATE ai_credits SET used = :u WHERE tenant_id = 'ten-ax' AND period_start = {LATEST}",  # noqa: S608
        {"u": used[0][0]},
    )


def set_used(owner_url: str, expr: str) -> None:
    owner_sql(owner_url, f"UPDATE ai_credits SET used = {expr} WHERE tenant_id = 'ten-ax' AND period_start = {LATEST}")  # noqa: S608


@pytest.mark.usefixtures("restore_credits")
def test_hard_cap_refuses_with_credits_reason(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    provider = fake_ai(client)
    as_karthik(client, kc)
    set_used(test_db.owner_url, "granted")
    res = client.post(ASK, json=TAMIL_QUESTION, headers=csrf(client))
    assert res.status_code == 429 and res.json()["error"]["code"] == "rate_limited"
    assert res.json()["error"]["details"][0]["path"] == "credits" and provider.calls == []


@pytest.mark.usefixtures("restore_credits")
def test_last_credit_is_capped(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    fake_ai(client)
    as_karthik(client, kc)
    set_used(test_db.owner_url, "granted - 1")
    res = client.post(ASK, json=TAMIL_QUESTION, headers=csrf(client)).json()
    assert res["answer"]["creditsUsed"] == 1 and res["credits"]["used"] == res["credits"]["granted"]


def test_credits_list_for_managers(client: TestClient, kc: FakeKeycloak) -> None:
    as_karthik(client, kc)
    page = client.get("/api/v1/ai/credits").json()
    assert page["total"] >= 1 and page["items"][0]["hardCap"] is True
    assert set(page["items"][0]) == {"tenantId", "periodStart", "periodEnd", "granted", "used", "hardCap"}
