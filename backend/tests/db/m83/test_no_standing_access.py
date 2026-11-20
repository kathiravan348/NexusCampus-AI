"""No standing provider access (NEX-051, ARCHITECTURE §10): without an active grant, a provider reaches nothing."""

from typing import Any

from fastapi.testclient import TestClient

from tests.db.auth_fixtures import sign_in
from tests.db.m83.helpers import bearer, credential, csrf, granted
from tests.fake_keycloak import FakeKeycloak
from tests.routes import api_routes

TENANT_MODULES = {f"M{n:02d}" for n in range(1, 12)}
FORGED = "ngc1.ten-ls.acg_x.stf-0042.9999999999.c2ln"


def _require_modules(dependant: Any) -> set[str]:
    """Modules of the `require` guards on a route (SCIM's own bearer auth is not one)."""
    found: set[str] = set()
    for dep in dependant.dependencies:
        marker = getattr(dep.call, "__nexus_guard__", None)
        if marker and getattr(dep.call, "__qualname__", "").startswith("require."):
            found.add(marker[1])
        found |= _require_modules(dep)
    return found


def _tenant_routes(app: Any) -> list[tuple[str, str]]:
    calls = []
    for route in api_routes(app):
        if _require_modules(route.dependant) & TENANT_MODULES:
            path = route.path.replace("{", "").replace("}", "")  # each path param becomes its own name
            calls += [(method, path) for method in sorted(route.methods or ())]
    return calls


def test_every_tenant_route_refuses_a_provider_without_an_active_grant(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)
    modules = sorted(TENANT_MODULES - {"M08", "M09", "M11"})  # Little Steps' plan has no M11; M08/M09 not built
    grant, token = granted(client, modules, "edit")
    assert client.post(f"/api/v1/access-grants/{grant['id']}/revoke", headers=csrf(client)).status_code == 200
    client.cookies.clear()
    routes = _tenant_routes(client.app)
    assert len(routes) > 20
    for method, path in routes:
        anonymous = client.request(method, path, json={})
        assert anonymous.status_code == 401, (method, path, anonymous.status_code)
        forged = client.request(method, path, json={}, headers=bearer(FORGED))
        assert forged.status_code == 401, (method, path, forged.status_code)
        revoked = client.request(method, path, json={}, headers=bearer(token))
        assert revoked.status_code == 403, (method, path, revoked.status_code)


def test_no_credential_without_an_approved_active_grant(client: TestClient) -> None:
    assert credential(client, "acg-ls-0810", staff="stf-0019").status_code == 409  # ran out in August
    assert credential(client, "acg-nope").status_code == 404
    assert credential(client, "acg-ax-0915").status_code == 404  # Apex's grant: not visible from Little Steps
