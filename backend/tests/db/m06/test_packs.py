"""Compliance packs (NEX-052, M06, D45): same as the mocks; a tenant sees its own; DSR deadlines."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from tests.db.auth_fixtures import sign_in
from tests.fake_keycloak import FakeKeycloak

from nexus.modules.m06.packs import PACKS, dsr_due_at
from nexus.seed.demo import load_fixtures

RECEIVED = datetime(2026, 9, 1, 9, 0, tzinfo=UTC)


def test_pack_definitions_match_the_mock_fixtures() -> None:
    assert [p.model_dump(by_alias=True) for p in PACKS] == load_fixtures()["compliancePacks"]


def test_tenant_sees_its_own_packs(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    page = client.get("/api/v1/compliance-packs").json()
    assert [p["code"] for p in page["items"]] == ["dpdp"] and page["total"] == 1
    assert page["items"][0]["dsrDueDays"] == 30


def test_due_date_uses_the_strictest_pack() -> None:
    assert (dsr_due_at(RECEIVED, {"ferpa"}) - RECEIVED).days == 45
    assert (dsr_due_at(RECEIVED, {"ferpa", "coppa"}) - RECEIVED).days == 30
    assert (dsr_due_at(RECEIVED, set()) - RECEIVED).days == 30
