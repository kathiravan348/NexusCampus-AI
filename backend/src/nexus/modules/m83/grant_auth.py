"""Provider grant credentials (NEX-051, M83, V-3, ARCHITECTURE §10: no standing provider access).

An approved access grant lets provider staff fetch a short-lived credential (via the access broker; in Stage 1 the
dev-only `broker_stub`). It is an HMAC-signed bearer token:

    ngc1.<tenantId>.<grantId>.<staffRef>.<expiresAt unix seconds>.<signature>

It expires at most `CREDENTIAL_MINUTES` after issue and never after the grant ends. The signature only proves we
issued it: on **every** request `core/permissions.require` also reloads the grant, so a revoke or the grant's end
takes effect on the next request. Modules and mode come from the grant row, never from the token.

Every attempt with a genuine credential is written to the tenant's audit log (`m83.accessGrant.used` or
`.refused`, `actorKind = provider_grant`) in its own transaction, so refused and failing uses are kept too.
"""

import base64
import hashlib
import hmac
import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import text

from nexus.core import db
from nexus.core.audit import AuditInput, record_audit
from nexus.core.errors import ApiError
from nexus.core.request_context import SAFE_METHODS, RequestContext, app_settings
from nexus.core.tenancy import ProviderActor, TenantContext, tenant_transaction
from nexus.settings import Settings

PREFIX = "ngc1"
CREDENTIAL_MINUTES = 60
_GRANT = (
    "SELECT g.id, g.request_id, r.staff_ref, g.modules, g.mode, g.starts_at, g.ends_at, g.revoked_at "
    "FROM access_grants g JOIN access_requests r ON r.id = g.request_id WHERE g.id = :id"
)


@dataclass(frozen=True)
class GrantClaims:
    tenant_id: str
    grant_id: str
    staff_ref: str
    expires_at: int


@dataclass(frozen=True)
class ActiveGrant:
    id: str
    staff_ref: str
    modules: tuple[str, ...]
    mode: str
    ends_at: datetime


class GrantSigner:
    def __init__(self, key: bytes) -> None:
        if len(key) < 32:
            raise ValueError("the grant signing key must be at least 32 bytes")
        self._key = key

    @classmethod
    def from_settings(cls, settings: Settings) -> "GrantSigner":
        key = settings.grant_signing_key.get_secret_value()
        if key:
            return cls(key.encode("utf-8"))
        if settings.environment == "prod":
            raise RuntimeError("NEXUS_GRANT_SIGNING_KEY must be set in prod")
        return cls(secrets.token_bytes(32))  # dev/test: credentials die with the process

    def _sign(self, payload: str) -> str:
        digest = hmac.new(self._key, payload.encode("utf-8"), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    def issue(self, tenant_id: str, grant_id: str, staff_ref: str, expires_at: datetime) -> str:
        if any("." in part for part in (tenant_id, grant_id, staff_ref)):
            raise ValueError("credential parts must not contain dots")
        payload = f"{PREFIX}.{tenant_id}.{grant_id}.{staff_ref}.{int(expires_at.timestamp())}"
        return f"{payload}.{self._sign(payload)}"

    def verify(self, credential: str, now: datetime) -> GrantClaims | None:
        """The claims of a genuine, unexpired credential; None otherwise (the grant itself is checked later)."""
        parts = credential.split(".")
        if len(parts) != 6 or parts[0] != PREFIX or not all(parts):
            return None
        if not hmac.compare_digest(parts[5], self._sign(".".join(parts[:5]))):
            return None
        try:
            expires_at = int(parts[4])
        except ValueError:
            return None
        if expires_at <= now.timestamp():
            return None
        return GrantClaims(parts[1], parts[2], parts[3], expires_at)


def credential_of(request: Request) -> str | None:
    """The grant credential in `Authorization: Bearer ngc1.…`, if the request carries one."""
    header = request.headers.get("authorization", "")
    token = header[len("Bearer ") :].strip() if header.startswith("Bearer ") else ""
    return token if token.startswith(PREFIX + ".") else None


def signer_of(request: Request) -> GrantSigner:
    signer: GrantSigner = request.app.state.grant_signer
    return signer


def credential_expiry(grant_ends_at: datetime, now: datetime) -> datetime:
    return min(grant_ends_at, now + timedelta(minutes=CREDENTIAL_MINUTES))


def refusal(row: Any, staff_ref: str, module: str, method: str, now: datetime) -> str | None:
    """Why this grant cannot be used for `method` on `module` now (None = allowed)."""
    if row is None or row["staff_ref"] != staff_ref:
        return "unknown"
    if row["revoked_at"] is not None:
        return "revoked"
    if not row["starts_at"] <= now < row["ends_at"]:
        return "outside_window"
    if module not in row["modules"]:
        return "module_not_granted"
    if row["mode"] == "read" and method not in SAFE_METHODS:
        return "read_only"
    return None


@asynccontextmanager
async def provider_context(request: Request, module: str) -> AsyncIterator[tuple[RequestContext, ActiveGrant]]:
    """The tenant transaction of a request made on a grant credential; 401 if not genuine, 403 if not allowed."""
    credential = credential_of(request) or ""
    now = datetime.now(UTC)
    claims = signer_of(request).verify(credential, now)
    if claims is None:
        raise ApiError(401, "unauthorized", "The access credential is not valid.")
    settings = app_settings(request)
    sessions = db.sessionmaker()
    plain = TenantContext(claims.tenant_id)
    async with tenant_transaction(sessions, plain, settings) as session:
        row = (await session.execute(text(_GRANT), {"id": claims.grant_id})).mappings().first()
        reason = refusal(row, claims.staff_ref, module, request.method, now)
        if reason != "unknown":
            await record_audit(
                session,
                plain,
                AuditInput(
                    action="m83.accessGrant.used" if reason is None else "m83.accessGrant.refused",
                    actor_kind="provider_grant",
                    actor_id=claims.staff_ref,
                    grant_id=claims.grant_id,
                    target_type="accessGrant",
                    target_id=claims.grant_id,
                ),
            )
    if reason is not None or row is None:
        raise ApiError(403, "forbidden", "This access grant does not allow this.")
    grant = ActiveGrant(
        id=row["id"],
        staff_ref=row["staff_ref"],
        modules=tuple(row["modules"]),
        mode=row["mode"],
        ends_at=row["ends_at"],
    )
    ctx = TenantContext(claims.tenant_id, provider=ProviderActor(grant_id=grant.id, staff_ref=grant.staff_ref))
    async with tenant_transaction(sessions, ctx, settings, write=request.method not in SAFE_METHODS) as session:
        yield (
            RequestContext(
                tenant=ctx, db=session, user_id=grant.staff_ref, person_id="", session_id="", grant_id=grant.id
            ),
            grant,
        )
