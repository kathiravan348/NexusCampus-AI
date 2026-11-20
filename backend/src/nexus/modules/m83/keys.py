"""M83 keys (NEX-050, V-2): `GET /api/v1/vault/keys` (metadata only) and the key lifecycle used by provisioning and
offboarding: provision, rotate, destroy (crypto-shred). Lifecycle changes are audited.
"""

from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.fieldcrypto import FieldCipher
from nexus.core.ids import new_id
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.core.schemas import Contract
from nexus.core.tenancy import TenantContext
from nexus.core.vault import Vault, key_name

router = APIRouter(prefix="/api/v1", tags=["m83 data vault"])
Reader = Annotated[Authorized, Depends(require("m83.vault.read", "M83"), scope="function")]
_SELECT = "SELECT id, tenant_id, purpose, custody, status, created_at, rotated_at FROM vault_keys"


class KeyStatusOut(Contract):
    id: str
    tenant_id: str
    purpose: Literal["tenant_data", "field_health", "field_identity", "field_finance"]
    custody: Literal["platform", "byok", "hyok"]
    status: Literal["active", "rotating", "revoked", "destroyed"]
    created_at: datetime
    rotated_at: datetime | None


def vault_of(request: Request) -> Vault:
    vault: Vault = request.app.state.vault
    return vault


def cipher_of(request: Request) -> FieldCipher:
    cipher: FieldCipher = request.app.state.field_cipher
    return cipher


@router.get("/vault/keys", response_model=Page[KeyStatusOut])
async def list_keys(auth: Reader, page: Annotated[PageQuery, Depends(page_query)]) -> Page[KeyStatusOut]:
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM vault_keys"))).scalar_one()
    rows = (
        (
            await db.execute(
                text(_SELECT + " ORDER BY created_at, id LIMIT :n OFFSET :o"), {"n": page.page_size, "o": page.offset}
            )
        )
        .mappings()
        .all()
    )
    return Page.of([KeyStatusOut.model_validate(dict(r)) for r in rows], int(total), page)


async def _audit(db: AsyncSession, ctx: TenantContext, action: str, key_id: str, fields: list[str]) -> None:
    await record_audit(
        db,
        ctx,
        AuditInput(
            action=action, actor_kind="system", target_type="vaultKey", target_id=key_id, changes=changes(*fields)
        ),
    )


async def provision_key(
    db: AsyncSession, ctx: TenantContext, vault: Vault, purpose: str = "tenant_data", custody: str = "platform"
) -> str:
    """Creates the tenant's Transit key and its metadata row (idempotent per tenant + purpose)."""
    name = key_name(ctx.tenant_id, purpose)
    await vault.create_key(name)
    key_id = new_id("key")
    created = await db.execute(
        text(
            "INSERT INTO vault_keys (id, tenant_id, purpose, custody, status, vault_key_name) "
            "VALUES (:id, :t, :p, :c, 'active', :n) ON CONFLICT (tenant_id, purpose) DO NOTHING RETURNING id"
        ),
        {"id": key_id, "t": ctx.tenant_id, "p": purpose, "c": custody, "n": name},
    )
    if created.first() is not None:
        await _audit(db, ctx, "m83.key.created", key_id, ["purpose", "custody"])
    return name


async def rotate_key(db: AsyncSession, ctx: TenantContext, vault: Vault, cipher: FieldCipher, purpose: str) -> None:
    name = key_name(ctx.tenant_id, purpose)
    await vault.rotate(name)
    cipher.forget(name)
    row = (
        await db.execute(
            text("UPDATE vault_keys SET rotated_at = :now WHERE purpose = :p RETURNING id"),
            {"now": datetime.now(UTC), "p": purpose},
        )
    ).first()
    if row is not None:
        await _audit(db, ctx, "m83.key.rotated", row.id, ["rotatedAt"])


async def destroy_tenant_keys(db: AsyncSession, ctx: TenantContext, vault: Vault, cipher: FieldCipher) -> int:
    """Offboarding / crypto-shred: every key of the tenant is destroyed; encrypted fields become unreadable.

    The audit chain keeps verifying (its hash never covers encrypted values, ARCHITECTURE §6).
    """
    rows = (await db.execute(text("SELECT id, vault_key_name FROM vault_keys WHERE status <> 'destroyed'"))).all()
    for row in rows:
        await vault.destroy(row.vault_key_name)
        cipher.forget(row.vault_key_name)
        await db.execute(text("UPDATE vault_keys SET status = 'destroyed' WHERE id = :id"), {"id": row.id})
        await _audit(db, ctx, "m83.key.destroyed", row.id, ["status"])
    return len(rows)
