"""SSO providers (NEX-049, D44): `GET`/`POST /api/v1/sso-providers`, `PUT /api/v1/sso-providers/:id`.

Stored in NexusCampus (contract `SsoProvider`, never a secret) and mirrored as a Keycloak identity provider
linked to the tenant's organization, so users of the provider's email domains are sent to it. Client secrets live in
the vault (NEX-050); until one is set the Keycloak copy stays disabled.
"""

import re
from datetime import datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Body, Depends
from pydantic import Field, field_validator
from sqlalchemy import text

from nexus.core.bodies import parse_body
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.core.schemas import Contract
from nexus.modules.m02.keycloak_admin import KeycloakAdmin
from nexus.modules.m02.service import audit, keycloak_admin, not_found

router = APIRouter(prefix="/api/v1", tags=["m02 single sign-on"])
Manager = Annotated[Authorized, Depends(require("m02.sso.manage", "M02"))]
_DOMAIN = re.compile(r"^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")
_SELECT = (
    "SELECT id, tenant_id, institution_id, protocol, name, issuer_url, client_id, domains, scim_enabled, "
    "enabled, "
    "created_at, updated_at FROM sso_providers"
)


class SsoProviderIn(Contract):
    institution_id: str | None = Field(min_length=1, max_length=128)
    protocol: Literal["oidc", "saml2"]
    name: str = Field(min_length=1, max_length=200)
    issuer_url: str = Field(max_length=2048)
    client_id: str = Field(min_length=1, max_length=256)
    domains: list[str] = Field(min_length=1)
    scim_enabled: bool
    enabled: bool

    @field_validator("issuer_url")
    @classmethod
    def _https(cls, v: str) -> str:
        if not re.fullmatch(r"https://[^\s/?#]+[^\s]*", v):
            raise ValueError("Issuer URL must start with https://")
        return v

    @field_validator("client_id", "name", mode="before")
    @classmethod
    def _trim(cls, v: Any) -> Any:
        return v.strip() if isinstance(v, str) else v

    @field_validator("domains")
    @classmethod
    def _domains(cls, v: list[str]) -> list[str]:
        for d in v:
            if not _DOMAIN.fullmatch(d):
                raise ValueError("Must be a lower-case domain, e.g. riverside.example.edu")
        if len(set(v)) != len(v):
            raise ValueError("domains has duplicates")
        return v


class SsoProviderOut(SsoProviderIn):
    id: str
    tenant_id: str
    created_at: datetime
    updated_at: datetime


async def _get(auth: Authorized, provider_id: str) -> SsoProviderOut:
    row = (await auth.ctx.db.execute(text(_SELECT + " WHERE id = :id"), {"id": provider_id})).mappings().first()
    if row is None:
        raise not_found()
    return SsoProviderOut.model_validate(dict(row))


async def _institution_ok(auth: Authorized, institution_id: str | None) -> None:
    if institution_id is None:
        return
    found = (await auth.ctx.db.execute(text("SELECT 1 FROM institutions WHERE id = :i"), {"i": institution_id})).first()
    if not found:
        raise not_found()


@router.get("/sso-providers", response_model=Page[SsoProviderOut])
async def list_providers(auth: Manager, page: Annotated[PageQuery, Depends(page_query)]) -> Page[SsoProviderOut]:
    total = (await auth.ctx.db.execute(text("SELECT count(*) FROM sso_providers"))).scalar_one()
    rows = (
        (
            await auth.ctx.db.execute(
                text(_SELECT + " ORDER BY created_at, id LIMIT :n OFFSET :o"),
                {"n": page.page_size, "o": page.offset},
            )
        )
        .mappings()
        .all()
    )
    return Page.of([SsoProviderOut.model_validate(dict(r)) for r in rows], int(total), page)


@router.post("/sso-providers", status_code=201, response_model=SsoProviderOut)
async def create_provider(
    auth: Manager, kc: Annotated[KeycloakAdmin, Depends(keycloak_admin)], body: Annotated[Any, Body()]
) -> SsoProviderOut:
    data = parse_body(SsoProviderIn, body)
    await _institution_ok(auth, data.institution_id)
    provider_id = new_id("sso")
    await auth.ctx.db.execute(
        text(
            "INSERT INTO sso_providers (id, tenant_id, institution_id, protocol, name, issuer_url, client_id, "
            "domains, "
            "scim_enabled, enabled) VALUES (:id, :t, :i, :p, :n, :u, :c, :d, :s, :e)"
        ),
        {"id": provider_id, "t": auth.ctx.tenant.tenant_id, **_params(data)},
    )
    await audit(auth, "m02.sso.created", "ssoProvider", provider_id, _fields(body))
    provider = await _get(auth, provider_id)
    await kc.upsert_identity_provider(tenant_id=auth.ctx.tenant.tenant_id, provider=provider.model_dump(by_alias=True))
    return provider


@router.put("/sso-providers/{provider_id}", response_model=SsoProviderOut)
async def update_provider(
    provider_id: str,
    auth: Manager,
    kc: Annotated[KeycloakAdmin, Depends(keycloak_admin)],
    body: Annotated[Any, Body()],
) -> SsoProviderOut:
    await _get(auth, provider_id)
    data = parse_body(SsoProviderIn, body)
    await _institution_ok(auth, data.institution_id)
    await auth.ctx.db.execute(
        text(
            "UPDATE sso_providers SET institution_id = :i, protocol = :p, name = :n, issuer_url = :u, "
            "client_id = :c, "
            "domains = :d, scim_enabled = :s, enabled = :e, updated_at = now() WHERE id = :id"
        ),
        {"id": provider_id, **_params(data)},
    )
    await audit(auth, "m02.sso.updated", "ssoProvider", provider_id, _fields(body))
    provider = await _get(auth, provider_id)
    await kc.upsert_identity_provider(tenant_id=auth.ctx.tenant.tenant_id, provider=provider.model_dump(by_alias=True))
    return provider


def _params(data: SsoProviderIn) -> dict[str, Any]:
    return {
        "i": data.institution_id,
        "p": data.protocol,
        "n": data.name,
        "u": data.issuer_url,
        "c": data.client_id,
        "d": data.domains,
        "s": data.scim_enabled,
        "e": data.enabled,
    }


def _fields(body: Any) -> list[str]:
    """Changed field names (the mock audits `Object.keys(input)`)."""
    return [k for k in body if isinstance(k, str) and re.fullmatch(r"[a-z][a-zA-Z0-9]*", k)]
