"""Text import (NEX-054, M04): dry-run diff, the mock's rejection reasons, all-or-nothing apply."""

from fastapi.testclient import TestClient

from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import LOCALE, csrf, group_override, last_action
from tests.fake_keycloak import FakeKeycloak

URL = "/api/v1/texts/overrides/import"


def test_dry_run_reports_every_reason_and_stores_nothing(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    entries = {
        "common.save": "Keep",
        "nope.key": "x",
        "common.cancel": 5,
        "common.edit": "   ",
        "common.delete": "{n, plural, one {x}}",
        "term.guardian": "Carer",
    }
    with group_override(test_db.owner_url, "term.guardian"):
        res = client.post(URL, json={"locale": LOCALE, "entries": entries, "dryRun": True}, headers=csrf(client))
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["dryRun"] is True and body["appliedCount"] == 0
    assert body["added"] == [{"key": "common.save", "before": None, "after": "Keep"}]
    assert {r["key"]: r["reason"] for r in body["rejected"]} == {
        "nope.key": "unknown_key",
        "common.cancel": "invalid_value",
        "common.edit": "empty_message",
        "common.delete": "invalid_icu",
        "term.guardian": "locked_by_group",
    }
    stored = client.get("/api/v1/texts/overrides", params={"locale": LOCALE}).json()["items"]
    assert all(o["key"] != "common.save" for o in stored)


def test_apply_is_all_or_nothing_then_diffs(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    refused = client.post(
        URL, json={"locale": LOCALE, "entries": {"common.search": "Find", "x.y": "z"}}, headers=csrf(client)
    )
    assert refused.status_code == 400
    assert [d["path"] for d in refused.json()["error"]["details"]] == ["entries.x.y"]
    applied = client.post(
        URL, json={"locale": LOCALE, "entries": {"common.search": "Find"}}, headers=csrf(client)
    ).json()
    assert applied["appliedCount"] == 1 and applied["added"][0]["key"] == "common.search"
    assert last_action(test_db.owner_url) == "m04.text.imported"
    again = client.post(URL, json={"locale": LOCALE, "entries": {"common.search": "Find"}}, headers=csrf(client)).json()
    assert again["unchanged"] == ["common.search"] and again["appliedCount"] == 0
    changed = client.post(
        URL, json={"locale": LOCALE, "entries": {"common.search": "Look up"}, "dryRun": True}, headers=csrf(client)
    )
    assert changed.json()["changed"] == [{"key": "common.search", "before": "Find", "after": "Look up"}]
    bad_locale = client.post(URL, json={"locale": "english", "entries": {}}, headers=csrf(client))
    assert bad_locale.status_code == 400
