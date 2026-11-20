"""RBAC and module switches (NEX-046, V-1): dated, scoped grants; `require` guards; deny by default."""

from collections.abc import AsyncIterator
from datetime import date
from typing import Annotated, Any

import pytest
from fastapi import Depends, FastAPI
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from nexus.core.permissions import CATALOGUE, Authorized, Grants, Resource, guard_of, load_grants, require
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.main import create_app
from nexus.seed.demo import load_fixtures
from tests.db.conftest import DbUrls
from tests.db.test_auth_flow import client, kc, sign_in  # noqa: F401  (fixtures)
from tests.fake_keycloak import FakeKeycloak

LS = TenantContext("ten-ls")
ARJUN = {"email": "arjun.mehta@littlesteps.example.edu", "sub": "kc-arjun"}
SUNITA = {"email": "sunita.rao@family.test", "sub": "kc-sunita"}


@pytest.fixture
async def app_sessions(test_db: DbUrls) -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine: AsyncEngine = create_async_engine(test_db.app_url)
    yield async_sessionmaker(engine, expire_on_commit=False)
    await engine.dispose()


async def grants_of(
    sessions: async_sessionmaker[AsyncSession], user_id: str, today: date | None = None
) -> Grants:
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        return await load_grants(s, user_id, today)


@pytest.mark.anyio
async def test_teacher_reads_users_but_cannot_invite(app_sessions: async_sessionmaker[AsyncSession]) -> None:
    arjun = await grants_of(app_sessions, "usr-ls-arjun")
    assert arjun.has("m02.user.read") and not arjun.has("m02.user.invite")
    priya = await grants_of(app_sessions, "usr-ls-priya")
    assert priya.has("m02.user.invite") and priya.has("m83.grant.approve")


@pytest.mark.anyio
async def test_guardian_scope_is_own_records_only(app_sessions: async_sessionmaker[AsyncSession]) -> None:
    sunita = await grants_of(app_sessions, "usr-ls-sunita")
    assert [s.kind for s in sunita.scopes("m07.preference.manage")] == ["own"]
    assert sunita.allows("m07.preference.manage", Resource(owner_user_id="usr-ls-sunita"))
    assert not sunita.allows("m07.preference.manage", Resource(owner_user_id="usr-ls-arjun"))
    assert not sunita.allows("m07.preference.manage", Resource(institution_id="ins-ls"))


@pytest.mark.anyio
async def test_campus_scope_covers_its_campus_only(app_sessions: async_sessionmaker[AsyncSession]) -> None:
    arjun = await grants_of(app_sessions, "usr-ls-arjun")
    assert arjun.allows("m02.user.read", Resource(institution_id="ins-ls", campus_id="cmp-ls-main"))
    assert not arjun.allows("m02.user.read", Resource(institution_id="ins-ls", campus_id="cmp-other"))


@pytest.mark.anyio
async def test_expired_or_future_assignments_grant_nothing(
    app_sessions: async_sessionmaker[AsyncSession], test_db: DbUrls
) -> None:
    engine = create_engine(test_db.owner_url)
    with engine.begin() as conn:
        conn.execute(
            text(
                "INSERT INTO role_assignments (id, tenant_id, user_id, role_id, scope_kind, scope_target_id, "
                "effective_from, effective_to, granted_by) VALUES ('ra-test-expired', 'ten-ls', "
                "'usr-ls-sunita', 'role-ls-admin', 'institution', 'ins-ls', '2025-01-01', '2025-12-31', "
                "'usr-ls-priya') "
                "ON CONFLICT (id) DO NOTHING"
            )
        )
    engine.dispose()
    assert not (await grants_of(app_sessions, "usr-ls-sunita")).has("m02.user.invite")
    assert (await grants_of(app_sessions, "usr-ls-sunita", date(2025, 6, 1))).has("m02.user.invite")


def test_system_roles_are_read_only_for_the_app(test_db: DbUrls) -> None:
    engine = create_engine(test_db.app_url)
    with pytest.raises(DBAPIError, match="system roles are read-only"), engine.begin() as conn:
        conn.execute(text("SELECT set_config('app.tenant_id', 'ten-ls', true)"))
        conn.execute(text("UPDATE roles SET name = 'Boss' WHERE system"))
    engine.dispose()


def test_catalogue_matches_the_mocks_and_the_database(test_db: DbUrls) -> None:
    ours = sorted((p.code, p.sensitive, p.description_key) for p in CATALOGUE)
    mocks = sorted((p["code"], p["sensitive"], p["descriptionKey"]) for p in load_fixtures()["permissions"])
    engine = create_engine(test_db.app_url)
    with engine.connect() as conn:
        db = sorted(
            tuple(r) for r in conn.execute(text("SELECT code, sensitive, description_key FROM permissions"))
        )
    engine.dispose()
    assert ours == mocks == db


def add_probe_routes(app: FastAPI) -> None:
    @app.get("/probe/invite")
    async def invite(
        auth: Annotated[Authorized, Depends(require("m02.user.invite", "M02"))],
    ) -> dict[str, str]:
        return {"user": auth.ctx.user_id}

    @app.get("/probe/assist")
    async def assist(
        auth: Annotated[Authorized, Depends(require("m11.assist.use", "M11"))],
    ) -> dict[str, str]:
        return {"user": auth.ctx.user_id}


def test_require_over_http(client: TestClient, kc: FakeKeycloak) -> None:  # noqa: F811
    add_probe_routes(client.app)  # type: ignore[arg-type]
    sign_in(client, kc, **ARJUN)
    assert client.get("/probe/invite").json()["error"]["code"] == "forbidden"
    me = client.get("/api/v1/me").json()
    assert "m02.user.read" in me["permissions"] and "m02.user.invite" not in me["permissions"]
    assert {a["scope"]["kind"] for a in me["assignments"]} == {"campus", "own"}
    # Little Steps has no AI in its plan: every M11 endpoint is module_disabled, even for its owner.
    assert client.get("/probe/assist").json()["error"]["code"] == "module_disabled"


def test_guardian_cannot_invite(client: TestClient, kc: FakeKeycloak) -> None:  # noqa: F811
    add_probe_routes(client.app)  # type: ignore[arg-type]
    sign_in(client, kc, **SUNITA)
    assert client.get("/probe/invite").status_code == 403


PUBLIC = {"/healthz", "/readyz", "/api/v1/auth/login", "/api/v1/auth/callback"}


def _guards(dependant: Any) -> list[tuple[str | None, str]]:
    found = []
    for dep in dependant.dependencies:
        g = guard_of(dep.call)
        if g is not None:
            found.append(g)
        found.extend(_guards(dep))
    return found


def test_every_non_public_route_has_a_guard() -> None:
    app = create_app()
    routes = [r for r in app.routes if isinstance(r, APIRoute)]
    unguarded = [r.path for r in routes if r.path not in PUBLIC and not _guards(r.dependant)]
    assert routes and unguarded == []
    for r in routes:
        for permission, module in _guards(r.dependant):
            assert permission is None or permission.startswith(module.lower() + "."), r.path
