"""Assist pipeline (NEX-058): sourced answers, credits + meter together, metadata-only log, no source → no call,
redaction, and the eval set with the fake provider."""

import pytest
from fastapi.testclient import TestClient

from nexus.devtools.ai_eval import load_cases, run_case
from nexus.modules.m11.gateway import Gateway
from nexus.modules.m11.providers.fake import FakeProvider
from nexus.modules.m11.redact import Redactor
from nexus.modules.m11.retrieval import HashEmbedder
from nexus.settings import Settings
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import owner_sql
from tests.db.m11.helpers import ASK, TAMIL_QUESTION, as_karthik, csrf, fake_ai, sessions  # noqa: F401
from tests.fake_keycloak import FakeKeycloak

CELL = Settings(environment="test", region="in")


def ax_credits(owner_url: str) -> tuple[int, int]:
    used = owner_sql(owner_url, "SELECT used FROM ai_credits WHERE tenant_id = 'ten-ax' ORDER BY period_start DESC")
    meter = owner_sql(
        owner_url,
        "SELECT used FROM usage_meters WHERE tenant_id = 'ten-ax' AND metric = 'ai_credits' ORDER BY period_start DESC",
    )
    return int(used[0][0]), int(meter[0][0])


def test_tamil_question_gets_a_sourced_answer_and_is_charged(
    client: TestClient, kc: FakeKeycloak, test_db: DbUrls
) -> None:
    provider = fake_ai(client)
    as_karthik(client, kc)
    before, _ = ax_credits(test_db.owner_url)
    res = client.post(ASK, json=TAMIL_QUESTION, headers=csrf(client))
    assert res.status_code == 200, res.text
    answer = res.json()["answer"]
    assert answer["aiGenerated"] is True and answer["locale"] == "ta-IN" and answer["tier"] == "balanced"
    assert {(s["recordType"], s["recordId"]) for s in answer["sources"]} >= {("academicCalendar", "cal-ax-2026")}
    assert all(s["moduleId"] not in ("M61", "M83") for s in answer["sources"])
    assert "முதல் பேட்ச்" in answer["answer"] and answer["creditsUsed"] == 2
    assert len(provider.calls) == 1 and provider.calls[0][0] == "fake-balanced"
    used, meter = ax_credits(test_db.owner_url)
    assert used == before + 2 == meter == res.json()["credits"]["used"]
    log = owner_sql(
        test_db.owner_url, "SELECT * FROM ai_answer_log WHERE tenant_id = 'ten-ax' ORDER BY created_at DESC"
    )
    assert log and "முதல்" not in str(log[-1])  # metadata only: never the question or the answer


def test_no_source_means_no_model_call_and_no_credit(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    provider = fake_ai(client)
    as_karthik(client, kc)
    before = ax_credits(test_db.owner_url)
    res = client.post(ASK, json={"question": "பேருந்து கட்டணம் எவ்வளவு?", "locale": "ta-IN"}, headers=csrf(client))
    assert res.status_code == 200 and res.json()["answer"] is None
    assert provider.calls == [] and ax_credits(test_db.owner_url) == before


def test_refused_answer_is_not_charged(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    fake_ai(client, refuse=True)
    as_karthik(client, kc)
    before = ax_credits(test_db.owner_url)
    res = client.post(ASK, json=TAMIL_QUESTION, headers=csrf(client))
    assert res.json()["answer"] is None and ax_credits(test_db.owner_url) == before


def test_names_emails_and_phones_never_reach_the_model() -> None:
    r = Redactor(["மீனா ராஜன்", "Suresh Kumar"])
    sent = r.redact("Ask மீனா ராஜன் or Suresh Kumar (suresh@apex.example.edu, +91 98400 12345).")
    assert "மீனா" not in sent and "Suresh" not in sent and "@" not in sent and "98400" not in sent
    assert (
        r.restore(f"Contact {sent}") == "Contact Ask மீனா ராஜன் or Suresh Kumar (suresh@apex.example.edu, +91 98400 12345)."
    )


@pytest.mark.anyio
async def test_eval_set_passes_with_the_fake_provider(sessions) -> None:  # type: ignore[no-untyped-def]  # noqa: F811
    gateway = Gateway(FakeProvider(), {"balanced": "fake", "fast": "fake", "reasoning": "fake"})
    results = [await run_case(sessions, CELL, gateway, HashEmbedder(), case) for case in load_cases()]
    assert len(results) >= 5 and all(ok for ok, _ in results)
