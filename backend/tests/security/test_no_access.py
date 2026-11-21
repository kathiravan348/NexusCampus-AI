"""No-access tests for the vault rules V-1…V-7 (NEX-065, REQUIREMENTS "V", ARCHITECTURE §6, §10).

Every test names its requirement id. These are release gates: unlike timing budgets they must pass. The RLS check is
proven to have teeth: `test_V1_rls_check_fails_when_a_policy_is_broken` breaks one policy (in a rolled-back
transaction) and asserts the same check reports the leak.
"""

import logging
import re
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Connection, Engine, create_engine, text
from sqlalchemy.exc import IntegrityError

from nexus.core.vault import FakeVault, KeyDestroyed
from nexus.modules.m11.retrieval import HashEmbedder, index_record
from nexus.settings import BACKEND_ROOT
from tests.db.auth_fixtures import PRIYA, sign_in
from tests.db.conftest import DbUrls
from tests.db.m83.helpers import bearer, credential, csrf, grant_audit, granted, owner_execute
from tests.fake_keycloak import FakeKeycloak
from tests.routes import api_routes

LS, AX = "ten-ls", "ten-ax"
FORGED = "ngc1.ten-ls.acg_x.stf-0042.9999999999.c2ln"
ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
REPO = Path(BACKEND_ROOT).parent


@pytest.fixture(scope="module")
def app_engine(test_db: DbUrls) -> Iterator[Engine]:
    engine = create_engine(test_db.app_url)
    yield engine
    engine.dispose()


def tenant_tables(conn: Connection) -> list[str]:
    rows = conn.execute(
        text(
            "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "JOIN information_schema.columns k ON k.table_schema = n.nspname AND k.table_name = c.relname "
            "WHERE n.nspname = 'public' AND c.relkind = 'r' AND k.column_name = 'tenant_id' ORDER BY 1"
        )
    ).scalars()
    return list(rows)


def rls_leaks(conn: Connection, tenant: str) -> list[str]:
    """Tables where a connection scoped to `tenant` can see another tenant's rows (or rows with no context)."""
    leaks = []
    for table in [*tenant_tables(conn), "tenants"]:
        column = "id" if table == "tenants" else "tenant_id"
        conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant})
        foreign = conn.execute(text(f"SELECT count(*) FROM {table} WHERE {column} <> :t"), {"t": tenant})  # noqa: S608
        if foreign.scalar_one():
            leaks.append(table)
    return leaks


# --- V-1 Zero standing access -------------------------------------------------------------------------------------


def test_V1_every_tenant_table_has_forced_rls(app_engine: Engine) -> None:
    with app_engine.connect() as conn:
        tables = tenant_tables(conn)
        unprotected = conn.execute(
            text(
                "SELECT c.relname FROM pg_class c WHERE c.relname = ANY(:t) AND NOT (c.relrowsecurity AND "
                "c.relforcerowsecurity AND EXISTS (SELECT 1 FROM pg_policies p WHERE p.tablename = c.relname "
                "AND p.policyname = 'tenant_isolation'))"
            ),
            {"t": tables},
        ).scalars()
        assert len(tables) >= 40
        assert list(unprotected) == []
        role = conn.execute(text("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user")).one()
        assert tuple(role) == (False, False)


def test_V1_cross_tenant_rows_are_invisible_on_every_table(app_engine: Engine, test_db: DbUrls) -> None:
    owner = create_engine(test_db.owner_url)
    with owner.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM people WHERE tenant_id <> :t"), {"t": LS}).scalar_one() > 0
    owner.dispose()  # other tenants' data exists, so the check below is meaningful
    for tenant in (LS, AX):
        with app_engine.begin() as conn:
            assert rls_leaks(conn, tenant) == []
    with app_engine.connect() as conn:  # no tenant context: nothing at all
        for table in tenant_tables(conn):
            # Built-in fonts are shared platform rows (tenant_id NULL); every tenant row stays hidden.
            seen = conn.execute(text(f"SELECT count(*) FROM {table} WHERE tenant_id IS NOT NULL"))  # noqa: S608
            assert seen.scalar_one() == 0, table


def test_V1_rls_check_fails_when_a_policy_is_broken(test_db: DbUrls) -> None:
    """The broken-RLS fixture: one permissive policy must turn the V-1 check red."""
    owner = create_engine(test_db.owner_url)
    try:
        with owner.connect() as conn:
            trans = conn.begin()
            conn.execute(text("ALTER POLICY tenant_isolation ON campuses USING (true)"))
            conn.execute(text("SET LOCAL ROLE nexus_app"))
            assert rls_leaks(conn, LS) == ["campuses"]
            trans.rollback()
    finally:
        owner.dispose()


def test_V1_provider_without_a_grant_reaches_nothing(client: TestClient) -> None:
    routes = [r for r in api_routes(client.app) if "/dev/" not in r.path and r.path.startswith("/api/v1/")]
    open_paths = {"/api/v1/auth/login", "/api/v1/auth/callback", "/api/v1/auth/logout", "/api/v1/auth/sso/discover"}
    checked = 0
    for route in routes:
        if route.path in open_paths or route.path.startswith("/api/v1/scim/"):
            continue
        path = route.path.replace("{", "").replace("}", "")
        for method in sorted(route.methods or ()):
            res = client.request(method, path, json={}, headers=bearer(FORGED))
            assert res.status_code in (401, 403), (method, path, res.status_code)
            checked += 1
    assert checked > 40


def test_V1_tenant_comes_from_the_session_never_from_a_header(client: TestClient, kc: FakeKeycloak) -> None:
    spoof = {"X-Tenant-Id": AX, "X-Nexus-Tenant": AX, "X-Tenant": AX}
    assert client.get("/api/v1/tenant", headers=spoof).status_code == 401  # a header alone is no session
    sign_in(client, kc)
    tenant = client.get("/api/v1/tenant", headers=spoof)
    assert tenant.status_code == 200
    assert {i["tenantId"] for i in tenant.json()["institutions"]} == {LS}
    people = client.get("/api/v1/people", params={"pageSize": 200}, headers=spoof).json()["items"]
    assert people and all(p["id"].startswith("per-ls-") for p in people)


def test_V1_minor_details_are_masked_without_restricted_access(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, **ARJUN)  # teacher: reads users, has no restricted-data permission
    people = client.get("/api/v1/people", params={"pageSize": 200}).json()["items"]
    rohan = next(p for p in people if p["id"] == "per-ls-rohan")
    assert rohan["dateOfBirth"] is None and rohan["phone"] is None


def test_V1_disabled_module_is_closed_even_to_the_owner_and_a_grant(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc)  # Little Steps: AI is not in its plan
    for res in (client.get("/api/v1/ai/settings"), client.post("/api/v1/assist/ask", json={}, headers=csrf(client))):
        assert res.status_code == 403 and res.json()["error"]["code"] == "module_disabled"


# --- V-2 Vault and keys -------------------------------------------------------------------------------------------


@pytest.mark.anyio
async def test_V2_destroyed_tenant_key_makes_data_unreadable() -> None:
    vault = FakeVault()
    await vault.create_key("tenant-ten-ls-tenant-data")
    dk = await vault.data_key("tenant-ten-ls-tenant-data")
    assert await vault.unwrap("tenant-ten-ls-tenant-data", dk.wrapped) == dk.plaintext
    await vault.destroy("tenant-ten-ls-tenant-data")
    with pytest.raises(KeyDestroyed):
        await vault.unwrap("tenant-ten-ls-tenant-data", dk.wrapped)


@pytest.mark.anyio
async def test_V2_vault_and_health_modules_are_blocked_from_ai(test_db: DbUrls) -> None:
    from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

    from nexus.core.tenancy import TenantContext, bind_tenant

    engine = create_async_engine(test_db.app_url)
    try:
        async with async_sessionmaker(engine)() as s, s.begin():
            await bind_tenant(s, TenantContext(LS))
            for module in ("M83", "M61"):
                with pytest.raises((ValueError, IntegrityError)):
                    await index_record(
                        s, TenantContext(LS), HashEmbedder(), module_id=module, record_type="x", record_id="x",
                        label="x", locale="en", content="secret",
                    )  # fmt: skip
    finally:
        await engine.dispose()


def test_V2_ai_settings_never_unblock_vault_or_health(client: TestClient, kc: FakeKeycloak) -> None:
    sign_in(client, kc, email="karthik@apex.example.edu", sub="kc-karthik", organization=[AX])
    current = client.get("/api/v1/ai/settings").json()
    assert {"M61", "M83"} <= set(current["blockedModules"])
    body = {"enabled": True, "safeguardingEnabled": False, "defaultTier": current["defaultTier"]}
    res = client.put("/api/v1/ai/settings", json={**body, "modules": {"M83": True}}, headers=csrf(client))
    assert res.status_code == 400


# --- V-3 Access grants --------------------------------------------------------------------------------------------


def test_V3_grant_is_scoped_audited_and_ends(client: TestClient, kc: FakeKeycloak, test_db: DbUrls) -> None:
    sign_in(client, kc)
    grant, token = granted(client, ["M02"])
    assert client.get("/api/v1/users", headers=bearer(token)).status_code == 200
    assert client.get("/api/v1/tenant", headers=bearer(token)).status_code == 403  # M01 not granted
    owner_execute(
        test_db.owner_url,
        "UPDATE access_grants SET starts_at = now() - interval '3 hours', ends_at = now() - interval '1 hour' "
        "WHERE id = :g",
        {"g": grant["id"]},
    )
    assert client.get("/api/v1/users", headers=bearer(token)).status_code == 403  # expired: ends on its own
    assert credential(client, grant["id"]).status_code == 409
    actions = [a for a, _, _ in grant_audit(test_db.owner_url, grant["id"])]
    assert actions[:2] == ["m83.accessGrant.used", "m83.accessGrant.refused"] and len(actions) >= 3


def test_V3_grant_longer_than_72_hours_is_impossible(test_db: DbUrls) -> None:
    with pytest.raises(IntegrityError, match="at_most_72_hours"):
        owner_execute(
            test_db.owner_url,
            "UPDATE access_grants SET ends_at = starts_at + interval '73 hours' WHERE tenant_id = :t",
            {"t": LS},
        )


# --- V-4 Operate without reading ----------------------------------------------------------------------------------


def test_V4_logs_carry_no_personal_data(client: TestClient, kc: FakeKeycloak, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    sign_in(client, kc)
    people = client.get("/api/v1/people", params={"pageSize": 200}).json()["items"]
    client.get("/api/v1/me")
    client.post("/api/v1/users/invite", json={"email": "new.person@littlesteps.example.edu"}, headers=csrf(client))
    personal = {PRIYA["email"], "new.person@littlesteps.example.edu"}
    personal |= {p["displayName"] for p in people if p.get("displayName")}
    logged = "\n".join(r.getMessage() for r in caplog.records)
    assert caplog.records, "expected request logs"
    assert [value for value in personal if value in logged] == []


# --- V-5 Break-glass ----------------------------------------------------------------------------------------------


def test_V5_break_glass_needs_two_people_and_the_institution_sees_it(client: TestClient, test_db: DbUrls) -> None:
    with pytest.raises(IntegrityError, match="two_distinct_approvers"):
        owner_execute(
            test_db.owner_url,
            "INSERT INTO break_glass_notices (id, tenant_id, category, approver_refs, occurred_at, notified_at) "
            "VALUES ('bgn-x', :t, 'security_incident', ARRAY['stf-1', 'stf-1'], now(), now())",
            {"t": LS},
        )
    with pytest.raises(IntegrityError, match="notified_after_occurred"):
        owner_execute(
            test_db.owner_url,
            "INSERT INTO break_glass_notices (id, tenant_id, category, approver_refs, occurred_at, notified_at) "
            "VALUES ('bgn-y', :t, 'legal_order', ARRAY['stf-1', 'stf-2'], now(), now() - interval '1 day')",
            {"t": LS},
        )


# --- V-6 Self-hosted: no network path -----------------------------------------------------------------------------


def _published_ports(compose: str) -> dict[str, list[str]]:
    ports: dict[str, list[str]] = {}
    service, in_ports = "", False
    for line in compose.splitlines():
        if m := re.match(r"^  ([a-z0-9-]+):\s*$", line):
            service, in_ports = m.group(1), False
        elif re.match(r"^    ports:\s*$", line):
            in_ports = True
        elif in_ports and (m := re.match(r'^      - "?([^"]+)"?\s*$', line)):
            ports.setdefault(service, []).append(m.group(1))
        elif not line.startswith("      "):
            in_ports = False
    return ports


def test_V6_install_publishes_only_loopback_ports_and_never_vault() -> None:
    for compose in (REPO / "deploy/compose/compose.yaml", REPO / "backend/compose.yaml"):
        ports = _published_ports(compose.read_text(encoding="utf-8"))
        assert ports, compose
        for service, mapped in ports.items():
            assert all(p.startswith("127.0.0.1:") for p in mapped), (compose.name, service, mapped)
    install = _published_ports((REPO / "deploy/compose/compose.yaml").read_text(encoding="utf-8"))
    assert set(install) == {"keycloak", "web"}  # no database, cache, key service or API port leaves the host


def test_V6_dev_broker_is_not_mounted_in_production(test_db: DbUrls) -> None:
    from nexus.main import create_app
    from nexus.settings import Settings

    settings = Settings(
        environment="prod",
        region="in",
        database_url=test_db.app_url,  # type: ignore[arg-type]
        grant_signing_key="k" * 32,  # type: ignore[arg-type]
    )
    prod = create_app(settings)
    assert not [r.path for r in api_routes(prod) if "/dev/" in r.path]


# --- V-7 Nexus Control stores only metadata -----------------------------------------------------------------------


def test_V7_no_route_serves_tenant_records_without_a_tenant_guard(client: TestClient) -> None:
    """Stage 1 has no Nexus Control: every data route needs a tenant session or grant; the rest is sign-in, SCIM
    (its own tenant token) and health. A cross-tenant metadata endpoint would have to be added to this list."""
    unguarded = set()
    for route in api_routes(client.app):
        guarded = any(getattr(d.call, "__nexus_guard__", None) for d in _all_dependencies(route.dependant))
        if not guarded and "/dev/" not in route.path:
            unguarded.add(route.path)
    allowed = re.compile(r"^(/healthz|/readyz|/api/v1/auth/.*|/api/v1/me|/api/v1/scim/.*|/api/v1/sessions.*)$")
    assert sorted(p for p in unguarded if not allowed.match(p)) == []


def _all_dependencies(dependant: Any) -> list[Any]:
    found: list[Any] = []
    for dep in getattr(dependant, "dependencies", []):
        found.append(dep)
        found += _all_dependencies(dep)
    return found
