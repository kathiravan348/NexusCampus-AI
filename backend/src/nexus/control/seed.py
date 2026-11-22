"""Loads staff and role permissions from `control_fixtures.json` (exported by the mocks, NEX-096) as the owner role.

Idempotent: staff are upserted, role permissions replaced. Demo data only — real staff come from staff SSO.
"""

import json
from datetime import datetime
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel
from sqlalchemy import Connection, delete, insert
from sqlalchemy.dialects.postgresql import insert as pg_insert

from nexus.control.staff import Permission, StaffRole, StaffUser, role_permissions, staff_users

FIXTURES = Path(__file__).with_name("control_fixtures.json")
FIXTURES_VERSION = 2


class ControlFixtures(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    version: int
    staff: list[StaffUser]
    role_permissions: dict[StaffRole, list[Permission]]
    #: P01 data (NEX-101), validated by the account models when seeded.
    partners: list[dict[str, Any]] = []
    accounts: list[dict[str, Any]] = []
    contacts: list[dict[str, Any]] = []
    opportunities: list[dict[str, Any]] = []
    contracts: list[dict[str, Any]] = []
    notes: list[dict[str, Any]] = []


def load_fixtures(path: Path = FIXTURES) -> ControlFixtures:
    data = ControlFixtures.model_validate(json.loads(path.read_text(encoding="utf-8")))
    if data.version != FIXTURES_VERSION:
        raise ValueError(f"{path.name}: version {data.version} != {FIXTURES_VERSION}; re-export")
    return data


def seed(conn: Connection, data: ControlFixtures | None = None) -> int:
    fixtures = data or load_fixtures()
    for s in fixtures.staff:
        row = {
            "id": s.id,
            "display_name": s.display_name,
            "work_email": s.work_email,
            "roles": list(s.roles),
            "partner_id": s.partner_id,
            "mfa_enrolled": s.mfa_enrolled,
            "active": s.active,
            "last_sign_in_at": (
                datetime.fromisoformat(s.last_sign_in_at.replace("Z", "+00:00")) if s.last_sign_in_at else None
            ),
        }
        stmt = pg_insert(staff_users).values(row)
        conn.execute(
            stmt.on_conflict_do_update(index_elements=["id"], set_={k: v for k, v in row.items() if k != "id"})
        )
    conn.execute(delete(role_permissions))
    pairs = [{"role": r, "permission": p} for r, perms in fixtures.role_permissions.items() for p in perms]
    if pairs:
        conn.execute(insert(role_permissions), pairs)
    from nexus.control.accounts import seed_rows  # after staff: accounts reference owners and note authors

    seed_rows(
        conn, fixtures.model_dump(include={"partners", "accounts", "contacts", "opportunities", "contracts", "notes"})
    )
    return len(fixtures.staff)
