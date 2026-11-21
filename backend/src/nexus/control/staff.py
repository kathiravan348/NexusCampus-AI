"""Staff and role permissions (P13) — tables, contract models (`StaffUser`, `StaffSession`) and the store.

Mirrors `frontend/packages/contracts/src/control/staff.ts`. Staff identities are ours only; no permission reads
institution data (V-1, V-7).
"""

from datetime import UTC, datetime, timedelta
from typing import Annotated, Literal, Protocol

from pydantic import BaseModel, ConfigDict, StringConstraints
from pydantic.alias_generators import to_camel
from sqlalchemy import ARRAY, Boolean, Column, DateTime, MetaData, String, Table, Text, select
from sqlalchemy.ext.asyncio import AsyncEngine

metadata = MetaData()

staff_users = Table(
    "staff_users",
    metadata,
    Column("id", String(64), primary_key=True),
    Column("display_name", String(200), nullable=False),
    Column("work_email", String(320), nullable=False, unique=True),
    Column("roles", ARRAY(Text), nullable=False),
    Column("partner_id", String(64), nullable=True),
    Column("mfa_enrolled", Boolean, nullable=False),
    Column("active", Boolean, nullable=False),
    Column("last_sign_in_at", DateTime(timezone=True), nullable=True),
)

role_permissions = Table(
    "role_permissions",
    metadata,
    Column("role", String(32), primary_key=True),
    Column("permission", String(64), primary_key=True),
)

StaffRole = Literal[
    "super_admin",
    "sales",
    "billing",
    "support",
    "implementation",
    "release_manager",
    "sre",
    "security_officer",
    "partner",
]
Permission = Annotated[str, StringConstraints(pattern=r"^ctl\.[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*$")]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)


class StaffUser(_Camel):
    id: str
    display_name: str
    work_email: str
    roles: list[StaffRole]
    partner_id: str | None
    mfa_enrolled: bool
    active: bool
    last_sign_in_at: str | None


class StaffSession(_Camel):
    staff: StaffUser
    permissions: list[Permission]
    mfa_verified: Literal[True] = True
    expires_at: str


def utc_text(value: datetime) -> str:
    return value.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


class StaffStore(Protocol):
    async def session_of(self, staff_id: str, minutes: int) -> StaffSession | None: ...


class DbStaffStore:
    """Reads staff and role permissions as `control_app`."""

    def __init__(self, engine: AsyncEngine) -> None:
        self._engine = engine

    async def session_of(self, staff_id: str, minutes: int) -> StaffSession | None:
        async with self._engine.connect() as conn:
            row = (await conn.execute(select(staff_users).where(staff_users.c.id == staff_id))).mappings().first()
            if row is None or not row["active"] or not row["mfa_enrolled"]:
                return None
            roles = list(row["roles"])
            perms = await conn.execute(
                select(role_permissions.c.permission).where(role_permissions.c.role.in_(roles)).distinct()
            )
            permissions = sorted(p for (p,) in perms)
        last = row["last_sign_in_at"]
        staff = StaffUser(
            id=row["id"],
            display_name=row["display_name"],
            work_email=row["work_email"],
            roles=roles,
            partner_id=row["partner_id"],
            mfa_enrolled=row["mfa_enrolled"],
            active=row["active"],
            last_sign_in_at=utc_text(last) if last is not None else None,
        )
        expires = utc_text(datetime.now(UTC) + timedelta(minutes=minutes))
        return StaffSession(staff=staff, permissions=permissions, expires_at=expires)
