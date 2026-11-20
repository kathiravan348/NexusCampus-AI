"""Usage meters (NEX-055, M05): live learner / staff counts, plan limits, stored counters."""

from datetime import UTC, datetime

from fastapi.testclient import TestClient

from nexus.modules.m05.usage import current_period
from tests.db.auth_fixtures import sign_in
from tests.fake_keycloak import FakeKeycloak


def test_usage_counts_people_and_uses_plan_limits(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    page = client.get("/api/v1/usage").json()
    meters = {m["metric"]: m for m in page["items"]}
    assert list(meters) == ["learners", "staff", "storage_bytes", "ai_credits", "email"]
    assert meters["learners"]["used"] >= 4 and meters["learners"]["limit"] == 2000
    assert meters["staff"]["limit"] is None and meters["ai_credits"]["limit"] == 500
    assert meters["storage_bytes"]["used"] == 52_428_800
    assert {m["periodStart"] for m in page["items"]} == {"2026-09-01T00:00:00Z"}


def test_current_period_is_the_calendar_month() -> None:
    start, end = current_period(datetime(2026, 12, 31, 23, 0, tzinfo=UTC))
    assert (start.isoformat(), end.isoformat()) == ("2026-12-01T00:00:00+00:00", "2027-01-01T00:00:00+00:00")
