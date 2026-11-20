"""SCIM 2.0 Users (NEX-049, RFC 7643/7644): an institution's directory provisions accounts.

Auth: `Authorization: Bearer <tenantId>.<tokenId>.<secret>` (only `sha256(secret)` is stored; looked up inside
the
tenant's RLS context). The tenant needs M02 on and an enabled SSO provider with SCIM switched on. Supported:
list (`filter=userName eq "…"`, `startIndex`, `count`), get, create (→ `invited`), PATCH `active`, DELETE (=
suspend). Errors use the SCIM error schema; every change is audited as a system action.
"""

import hashlib
import re
import secrets
from collections.abc import AsyncIterator
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, FastAPI, Query, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core import db as core_db
from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.entitlements import module_enabled
from nexus.core.errors import ApiError
from nexus.core.hashchain import format_instant
from nexus.core.ids import new_id
from nexus.core.request_context import app_settings
from nexus.core.tenancy import TenantContext, tenant_transaction
from nexus.modules.m02.keycloak_admin import KeycloakAdmin
from nexus.modules.m02.service import keycloak_admin

router = APIRouter(prefix="/scim/v2", tags=["m02 scim"])
USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User"
LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse"
ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error"
PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp"
_FILTER = re.compile(r'^userName eq "([^"]+)"$')


class ScimError(Exception):
    def __init__(self, status: int, detail: str, scim_type: str | None = None) -> None:
        super().__init__(detail)
        self.status, self.detail, self.scim_type = status, detail, scim_type


def install_scim_errors(app: FastAPI) -> None:
    async def handler(_: Request, exc: Exception) -> Response:
        assert isinstance(exc, ScimError)
        body: dict[str, Any] = {"schemas": [ERROR_SCHEMA], "status": str(exc.status), "detail": exc.detail}
        if exc.scim_type:
            body["scimType"] = exc.scim_type
        return JSONResponse(body, status_code=exc.status, media_type="application/scim+json")

    app.add_exception_handler(ScimError, handler)


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ScimContext:
    tenant: TenantContext
    db: AsyncSession


async def scim_auth(request: Request) -> AsyncIterator[ScimContext]:
    header = request.headers.get("authorization", "")
    parts = header.removeprefix("Bearer ").split(".") if header.startswith("Bearer ") else []
    if len(parts) != 3 or not all(parts):
        raise ScimError(401, "A valid SCIM bearer token is required.")
    tenant_id, token_id, secret = parts
    try:
        async with tenant_transaction(core_db.sessionmaker(), TenantContext(tenant_id), app_settings(request)) as s:
            row = (
                await s.execute(
                    text("SELECT token_hash FROM scim_tokens WHERE id = :id AND revoked_at IS NULL"),
                    {"id": token_id},
                )
            ).first()
            if row is None or not secrets.compare_digest(row.token_hash, hash_secret(secret)):
                raise ScimError(401, "A valid SCIM bearer token is required.")
            scim_on = (
                await s.execute(text("SELECT 1 FROM sso_providers WHERE scim_enabled AND enabled LIMIT 1"))
            ).first()
            if not scim_on or not await module_enabled(s, tenant_id, "M02"):
                raise ScimError(403, "SCIM provisioning is not switched on for this institution.")
            yield ScimContext(TenantContext(tenant_id), s)
    except ApiError as exc:
        raise ScimError(exc.status, exc.message) from exc


scim_auth.__nexus_guard__ = (None, "M02")  # type: ignore[attr-defined]  # route walk: own bearer auth
Scim = Annotated[ScimContext, Depends(scim_auth, scope="function")]
Admin = Annotated[KeycloakAdmin, Depends(keycloak_admin)]

_USERS = (
    "SELECT u.id, u.email, u.status, u.created_at, u.updated_at, p.legal_name FROM users u "
    "JOIN people p ON p.id = u.person_id"
)


def _resource(row: Any) -> dict[str, Any]:
    return {
        "schemas": [USER_SCHEMA],
        "id": row.id,
        "userName": row.email,
        "displayName": row.legal_name,
        "name": {"formatted": row.legal_name},
        "emails": [{"value": row.email, "primary": True}],
        "active": row.status == "active",
        "meta": {
            "resourceType": "User",
            "created": format_instant(row.created_at),
            "lastModified": format_instant(row.updated_at),
            "location": f"/scim/v2/Users/{row.id}",
        },
    }


def _scim_json(body: dict[str, Any], status: int = 200) -> JSONResponse:
    return JSONResponse(body, status_code=status, media_type="application/scim+json")


async def _one(ctx: ScimContext, user_id: str) -> Any:
    row = (await ctx.db.execute(text(_USERS + " WHERE u.id = :id"), {"id": user_id})).first()
    if row is None:
        raise ScimError(404, "User not found.")
    return row


async def _audit(ctx: ScimContext, action: str, user_id: str, fields: list[str]) -> None:
    await record_audit(
        ctx.db,
        ctx.tenant,
        AuditInput(
            action=action,
            actor_kind="system",
            target_type="user",
            target_id=user_id,
            changes=changes(*fields),
        ),
    )


@router.get("/Users")
async def list_users(
    ctx: Scim,
    filter_: Annotated[str | None, Query(alias="filter")] = None,
    start_index: Annotated[int, Query(alias="startIndex", ge=1)] = 1,
    count: Annotated[int, Query(ge=0, le=200)] = 100,
) -> JSONResponse:
    where, params = "", {}
    if filter_:
        match = _FILTER.fullmatch(filter_.strip())
        if match is None:
            raise ScimError(400, 'Only filter=userName eq "…" is supported.', "invalidFilter")
        where, params = " WHERE lower(u.email) = lower(:e)", {"e": match.group(1)}
    count_sql = (
        "SELECT count(*) FROM users u WHERE lower(u.email) = lower(:e)" if params else "SELECT count(*) FROM users"
    )
    total = (await ctx.db.execute(text(count_sql), params)).scalar_one()
    rows = (
        await ctx.db.execute(
            text(_USERS + where + " ORDER BY u.created_at, u.id LIMIT :n OFFSET :o"),
            {**params, "n": count, "o": start_index - 1},
        )
    ).all()
    return _scim_json(
        {
            "schemas": [LIST_SCHEMA],
            "totalResults": int(total),
            "startIndex": start_index,
            "itemsPerPage": len(rows),
            "Resources": [_resource(r) for r in rows],
        }
    )


@router.get("/Users/{user_id}")
async def get_user(user_id: str, ctx: Scim) -> JSONResponse:
    return _scim_json(_resource(await _one(ctx, user_id)))


def _name_of(body: dict[str, Any]) -> str:
    name = body.get("name") or {}
    full = name.get("formatted") or " ".join(p for p in (name.get("givenName"), name.get("familyName")) if p)
    return str(full or body.get("displayName") or body["userName"]).strip()[:200]


@router.post("/Users")
async def create_user(ctx: Scim, body: Annotated[dict[str, Any], Body()]) -> JSONResponse:
    email = str(body.get("userName", "")).strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
        raise ScimError(400, "userName must be an email address.", "invalidValue")
    if (await ctx.db.execute(text("SELECT 1 FROM users WHERE lower(email) = :e"), {"e": email})).first():
        raise ScimError(409, "A user with this userName already exists.", "uniqueness")
    now, person_id, user_id = datetime.now(UTC), new_id("per"), new_id("usr")
    status = "invited" if body.get("active", True) is not False else "suspended"
    await ctx.db.execute(
        text(
            "INSERT INTO people (id, tenant_id, legal_name, is_minor, email, retention_state, created_at, "
            "updated_at) VALUES (:id, :t, :n, false, :e, 'active', :now, :now)"
        ),
        {"id": person_id, "t": ctx.tenant.tenant_id, "n": _name_of(body), "e": email, "now": now},
    )
    await ctx.db.execute(
        text(
            "INSERT INTO users (id, tenant_id, person_id, email, status, mfa_enabled, passkey_count, "
            "sso_only, "
            "created_at, updated_at) VALUES (:id, :t, :p, :e, :s, false, 0, true, :now, :now)"
        ),
        {"id": user_id, "t": ctx.tenant.tenant_id, "p": person_id, "e": email, "s": status, "now": now},
    )
    await _audit(ctx, "m02.scim.userProvisioned", user_id, ["email", "status"])
    return _scim_json(_resource(await _one(ctx, user_id)), status=201)


async def _set_active(ctx: ScimContext, kc: KeycloakAdmin, user_id: str, active: bool) -> None:
    row = await _one(ctx, user_id)
    new_status = ("invited" if row.status == "invited" else "active") if active else "suspended"
    await ctx.db.execute(
        text("UPDATE users SET status = :s, updated_at = now() WHERE id = :id"),
        {"s": new_status, "id": user_id},
    )
    if not active:
        await ctx.db.execute(
            text("UPDATE sessions SET revoked_at = now() WHERE user_id = :u AND revoked_at IS NULL"),
            {"u": user_id},
        )
    await _audit(ctx, "m02.scim.userUpdated" if active else "m02.scim.userDeactivated", user_id, ["status"])
    await kc.set_enabled(email=row.email, enabled=active)


@router.patch("/Users/{user_id}")
async def patch_user(user_id: str, ctx: Scim, kc: Admin, body: Annotated[dict[str, Any], Body()]) -> JSONResponse:
    if PATCH_SCHEMA not in body.get("schemas", []):
        raise ScimError(400, "Expected a PatchOp request.", "invalidSyntax")
    for op in body.get("Operations", []):
        value = op.get("value")
        path = str(op.get("path", "")).strip()
        if str(op.get("op", "")).lower() != "replace":
            raise ScimError(400, "Only replace operations are supported.", "invalidValue")
        if path == "active" and isinstance(value, bool):
            await _set_active(ctx, kc, user_id, value)
        elif not path and isinstance(value, dict) and isinstance(value.get("active"), bool) and len(value) == 1:
            await _set_active(ctx, kc, user_id, value["active"])
        else:
            raise ScimError(400, "Only the active attribute can be changed.", "invalidPath")
    return _scim_json(_resource(await _one(ctx, user_id)))


@router.delete("/Users/{user_id}", status_code=204)
async def delete_user(user_id: str, ctx: Scim, kc: Admin) -> Response:
    """Deprovisioning suspends the account (records stay for the institution's retention rules)."""
    await _set_active(ctx, kc, user_id, False)
    return Response(status_code=204)
