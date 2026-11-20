"""RBAC and entitlement tables (migration `0004_rbac_entitlements`), mirroring `contracts/src/rbac.ts` and
`plan.ts` (Entitlement). `permissions` is the global catalogue; everything else is per tenant under RLS.
"""

from datetime import date, datetime

from sqlalchemy import (
    ARRAY,
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, Timestamps, id_column

ENUM = 32
SCOPE_KINDS = "('group', 'institution', 'campus', 'department', 'class', 'own')"
SCOPE_KINDS_ARRAY = "ARRAY['group', 'institution', 'campus', 'department', 'class', 'own']::varchar[]"


class Permission(Base):
    __tablename__ = "permissions"
    __table_args__ = (
        CheckConstraint(
            "code ~ '^[mp](0[1-9]|[1-9][0-9])\\.[a-z][a-z0-9_]*\\.[a-z][a-z0-9_]*$'", name="code_format"
        ),
        CheckConstraint("code LIKE lower(module_id) || '.%'", name="code_in_module"),
    )
    code: Mapped[str] = mapped_column(String(80), primary_key=True)
    module_id: Mapped[str] = mapped_column(String(3))
    sensitive: Mapped[bool] = mapped_column(Boolean)
    description_key: Mapped[str] = mapped_column(String(120))


class Role(Timestamps, Base):
    __tablename__ = "roles"
    __table_args__ = (
        UniqueConstraint("id", "tenant_id"),
        CheckConstraint("cardinality(allowed_scope_kinds) >= 1", name="has_scope_kinds"),
        CheckConstraint(f"allowed_scope_kinds <@ {SCOPE_KINDS_ARRAY}", name="scope_kinds_known"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    system: Mapped[bool] = mapped_column(Boolean)
    allowed_scope_kinds: Mapped[list[str]] = mapped_column(ARRAY(String(ENUM)))


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (ForeignKeyConstraint(["role_id", "tenant_id"], ["roles.id", "roles.tenant_id"]),)
    role_id: Mapped[str] = mapped_column(String(ID_LENGTH), primary_key=True)
    permission_code: Mapped[str] = mapped_column(String(80), ForeignKey("permissions.code"), primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)


class RoleAssignment(Base):
    __tablename__ = "role_assignments"
    __table_args__ = (
        ForeignKeyConstraint(["user_id", "tenant_id"], ["users.id", "users.tenant_id"]),
        ForeignKeyConstraint(["role_id", "tenant_id"], ["roles.id", "roles.tenant_id"]),
        CheckConstraint(f"scope_kind IN {SCOPE_KINDS}", name="scope_kind_known"),
        CheckConstraint("(scope_target_id IS NULL) = (scope_kind = 'own')", name="target_iff_not_own"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="effective_range"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(ID_LENGTH), index=True)
    role_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    scope_kind: Mapped[str] = mapped_column(String(ENUM))
    scope_target_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    academic_year_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    granted_by: Mapped[str] = mapped_column(String(ID_LENGTH))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Entitlement(Base):
    __tablename__ = "entitlements"
    __table_args__ = (
        CheckConstraint("source IN ('core', 'plan', 'addon', 'trial')", name="source_known"),
        CheckConstraint("source <> 'core' OR enabled", name="core_always_on"),
        CheckConstraint("source <> 'trial' OR expires_at IS NOT NULL", name="trial_expires"),
    )
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), primary_key=True)
    module_id: Mapped[str] = mapped_column(String(3), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean)
    source: Mapped[str] = mapped_column(String(ENUM))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
