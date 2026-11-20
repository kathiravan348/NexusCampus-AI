"""M02 identity tables (migration `0003_identity`), mirroring `contracts/src/person.ts` and `user.ts` (D25:
one `Person`, many `RoleProfile` memberships, one sign-in `User`). Credentials live in Keycloak (D44): no
passwords here, and a session stores only the SHA-256 of its token.
"""

from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from nexus.core.models import ID_LENGTH, Base, Timestamps, id_column

NAME = 200
ENUM = 32


class Person(Timestamps, Base):
    __tablename__ = "people"
    __table_args__ = (
        UniqueConstraint("id", "tenant_id"),
        CheckConstraint("phone IS NULL OR phone ~ '^\\+[1-9][0-9]{6,14}$'", name="phone_e164"),
        CheckConstraint(
            "retention_state IN ('active', 'archived', 'crypto_shredded')", name="retention_known"
        ),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    legal_name: Mapped[str] = mapped_column(String(NAME))
    preferred_name: Mapped[str | None] = mapped_column(String(NAME))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    is_minor: Mapped[bool] = mapped_column(Boolean)
    email: Mapped[str | None] = mapped_column(String(254))
    phone: Mapped[str | None] = mapped_column(String(16))
    preferred_locale: Mapped[str | None] = mapped_column(String(35))
    retention_state: Mapped[str] = mapped_column(String(ENUM))


class User(Timestamps, Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("id", "tenant_id"),
        ForeignKeyConstraint(["person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        CheckConstraint("status IN ('invited', 'active', 'suspended', 'locked')", name="status_known"),
        CheckConstraint("passkey_count >= 0", name="passkeys_not_negative"),
        Index("uq_users_tenant_email", "tenant_id", text("lower(email)"), unique=True),
        Index(
            "uq_users_tenant_idp_subject",
            "tenant_id",
            "idp_subject",
            unique=True,
            postgresql_where=text("idp_subject IS NOT NULL"),
        ),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    email: Mapped[str] = mapped_column(String(254))
    status: Mapped[str] = mapped_column(String(ENUM))
    mfa_enabled: Mapped[bool] = mapped_column(Boolean)
    passkey_count: Mapped[int] = mapped_column(Integer)
    sso_only: Mapped[bool] = mapped_column(Boolean)
    last_sign_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: Keycloak `sub`, pinned at the first sign-in (D44).
    idp_subject: Mapped[str | None] = mapped_column(String(255))


class RoleProfile(Timestamps, Base):
    __tablename__ = "role_profiles"
    __table_args__ = (
        ForeignKeyConstraint(["person_id", "tenant_id"], ["people.id", "people.tenant_id"]),
        ForeignKeyConstraint(["institution_id", "tenant_id"], ["institutions.id", "institutions.tenant_id"]),
        CheckConstraint("kind IN ('staff', 'guardian', 'learner', 'alumni', 'external')", name="kind_known"),
        CheckConstraint("status IN ('active', 'inactive', 'suspended')", name="status_known"),
        CheckConstraint("effective_to IS NULL OR effective_to >= effective_from", name="effective_range"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    person_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    institution_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    campus_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    kind: Mapped[str] = mapped_column(String(ENUM))
    academic_year_id: Mapped[str | None] = mapped_column(String(ID_LENGTH))
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(ENUM))


class Session(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        ForeignKeyConstraint(["user_id", "tenant_id"], ["users.id", "users.tenant_id"]),
        CheckConstraint("auth_method IN ('password', 'sso', 'passkey')", name="auth_method_known"),
        CheckConstraint("last_seen_at >= created_at", name="seen_after_created"),
        CheckConstraint("expires_at > created_at", name="expires_after_created"),
        CheckConstraint("revoked_at IS NULL OR revoked_at >= created_at", name="revoked_after_created"),
        CheckConstraint("token_hash IS NULL OR token_hash ~ '^[0-9a-f]{64}$'", name="token_hash_hex"),
    )
    id: Mapped[str] = id_column(primary_key=True)
    tenant_id: Mapped[str] = mapped_column(String(ID_LENGTH), ForeignKey("tenants.id"), index=True)
    user_id: Mapped[str] = mapped_column(String(ID_LENGTH), index=True)
    device_id: Mapped[str] = mapped_column(String(ID_LENGTH))
    device_label: Mapped[str] = mapped_column(String(NAME))
    auth_method: Mapped[str] = mapped_column(String(ENUM))
    mfa_verified: Mapped[bool] = mapped_column(Boolean)
    ip_address: Mapped[str | None] = mapped_column(String(45))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    #: Absolute end; the idle limit is checked against `last_seen_at`.
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    #: SHA-256 hex of the cookie token; NULL for imported demo sessions (they can never be used).
    token_hash: Mapped[str | None] = mapped_column(String(64))


IDENTITY_TABLES = ("people", "users", "role_profiles", "sessions")
