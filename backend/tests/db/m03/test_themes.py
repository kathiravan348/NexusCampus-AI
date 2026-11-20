"""Theme and font API (NEX-053, M03): layers and merge, group locks (409), contrast guard (400), versions, audit."""

from collections.abc import Iterator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text

from nexus.core.sessions import CSRF_COOKIE, CSRF_HEADER
from tests.db.auth_fixtures import sign_in
from tests.db.conftest import DbUrls
from tests.fake_keycloak import FakeKeycloak

ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
EDITABLE = ("light", "dark", "fonts", "radius", "density", "assets")


def csrf(c: TestClient) -> dict[str, str]:
    return {CSRF_HEADER: c.cookies.get(CSRF_COOKIE) or ""}


def owner_sql(owner_url: str, sql: str) -> Any:
    engine = create_engine(owner_url)
    with engine.begin() as conn:
        result = conn.execute(text(sql))
        rows = result.all() if result.returns_rows else None
    engine.dispose()
    return rows


def institution_layer(client: TestClient) -> dict[str, Any]:
    layers = client.get("/api/v1/theme").json()["layers"]
    layer: dict[str, Any] = next(t for t in layers if t["scope"]["kind"] == "institution")
    return layer


def body_of(layer: dict[str, Any], **changes: Any) -> dict[str, Any]:
    return {**{k: layer[k] for k in EDITABLE}, **changes}


@pytest.fixture
def group_lock(test_db: DbUrls) -> Iterator[None]:
    """A Little Steps group layer that locks `brand-primary` (removed afterwards)."""
    owner_sql(
        test_db.owner_url,
        "INSERT INTO themes (id, tenant_id, scope_kind, scope_target_id, light, dark, fonts, radius, assets, "
        "locked_tokens, version, updated_by, updated_at) VALUES ('thm-ls-group-test', 'ten-ls', 'group', "
        "'grp-ls-test', '{\"brand-primary\": \"#991B1B\"}', '{}', '{\"sans\": null, \"mono\": null}', '{}', "
        '\'{"logoUrl": null, "faviconUrl": null, "loginImageUrl": null}\', \'{brand-primary}\', 1, '
        "'usr-ls-priya', now())",
    )
    yield
    owner_sql(test_db.owner_url, "DELETE FROM themes WHERE id = 'thm-ls-group-test'")


def test_theme_layers_and_merge(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    theme = client.get("/api/v1/theme").json()
    assert set(theme) == {"effective", "layers", "lockedTokens"} and theme["lockedTokens"] == []
    layer = theme["layers"][0]
    assert layer["scope"] == {"kind": "institution", "targetId": layer["scope"]["targetId"]}
    assert theme["effective"]["radius"] == {"radius-md": "10px"} and theme["effective"]["density"] == "spacious"
    assert theme["effective"]["light"]["brand-primary"] == layer["light"]["brand-primary"]
    assert client.get("/api/v1/theme", params={"campusId": "cmp-ls-main"}).status_code == 200
    assert client.get("/api/v1/theme", params={"campusId": "cmp-nope"}).status_code == 404


def test_save_bumps_version_and_audits(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    layer = institution_layer(client)
    light = {**layer["light"], "brand-primary": "#9A1C14", "brand-primary-text": "#9A1C14"}
    res = client.put("/api/v1/theme", json=body_of(layer, light=light), headers=csrf(client))
    assert res.status_code == 200, res.text
    saved = res.json()["layers"][-1]
    assert saved["version"] == layer["version"] + 1 and saved["updatedBy"] == "usr-ls-priya"
    assert res.json()["effective"]["light"]["brand-primary"] == "#9A1C14"
    last = owner_sql(
        test_db.owner_url, "SELECT action FROM audit_events WHERE tenant_id = 'ten-ls' ORDER BY seq DESC LIMIT 1"
    )
    assert last[0][0] == "m03.theme.updated"


def test_failing_contrast_is_refused_and_names_the_pair(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    layer = institution_layer(client)
    light = {**layer["light"], "brand-primary": "#FACC15", "on-brand": "#FFFFFF"}
    res = client.put("/api/v1/theme", json=body_of(layer, light=light), headers=csrf(client))
    assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_request"
    details = res.json()["error"]["details"]
    assert "light.on-brand" in {d["path"] for d in details}
    assert any("needs 4.5:1" in d["message"] for d in details)
    assert institution_layer(client)["version"] == layer["version"]  # nothing stored


def test_unknown_tokens_fonts_and_bad_values(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    layer = institution_layer(client)
    unknown = body_of(
        layer,
        light={**layer["light"], "not-a-token": "#000000"},
        radius={"radius-huge": "40px"},
        fonts={"sans": "font-nope", "mono": None},
    )
    res = client.put("/api/v1/theme", json=unknown, headers=csrf(client))
    paths = {d["path"] for d in res.json()["error"]["details"]}
    assert res.status_code == 400 and paths == {"light.not-a-token", "radius.radius-huge", "fonts.sans"}
    bad = body_of(layer, assets={"logoUrl": "/\\evil.example/x.svg", "faviconUrl": None, "loginImageUrl": None})
    assert client.put("/api/v1/theme", json=bad, headers=csrf(client)).status_code == 400
    assert client.put("/api/v1/theme", json={**body_of(layer), "x": 1}, headers=csrf(client)).status_code == 400


@pytest.mark.usefixtures("group_lock")
def test_group_locked_tokens_cannot_change(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    theme = client.get("/api/v1/theme").json()
    assert theme["lockedTokens"] == ["brand-primary"]
    assert theme["effective"]["light"]["brand-primary"] == "#991B1B"  # the group's value wins
    layer = institution_layer(client)
    light = {**layer["light"], "brand-primary": "#9A1C14"}
    res = client.put("/api/v1/theme", json=body_of(layer, light=light), headers=csrf(client))
    assert res.status_code == 409 and res.json()["error"]["details"][0]["path"] == "light.brand-primary"


def test_teachers_cannot_save_and_fonts_list(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)
    layer = institution_layer(client)
    assert client.put("/api/v1/theme", json=body_of(layer), headers=csrf(client)).status_code == 403
    fonts = client.get("/api/v1/fonts").json()
    assert fonts["total"] == 4
    assert set(fonts["items"][0]) == {"id", "family", "source", "roles", "scripts", "fileUrl"}
