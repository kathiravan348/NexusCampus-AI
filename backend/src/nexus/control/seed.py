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
FIXTURES_VERSION = 7


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
    #: P02, P03, P11 data (NEX-102).
    catalogue: list[dict[str, Any]] = []
    quotes: list[dict[str, Any]] = []
    subscriptions: list[dict[str, Any]] = []
    invoices: list[dict[str, Any]] = []
    payments: list[dict[str, Any]] = []
    credit_notes: list[dict[str, Any]] = []
    dunning: list[dict[str, Any]] = []
    usage: list[dict[str, Any]] = []
    #: P05 (NEX-103).
    licences: list[dict[str, Any]] = []
    #: P06 (NEX-113).
    deployments: list[dict[str, Any]] = []
    health_signals: list[dict[str, Any]] = []
    #: P07 (NEX-115).
    releases: list[dict[str, Any]] = []
    rollouts: list[dict[str, Any]] = []
    #: P09 (NEX-122).
    tickets: list[dict[str, Any]] = []
    ticket_replies: list[dict[str, Any]] = []
    sla_policies: list[dict[str, Any]] = []
    kb_articles: list[dict[str, Any]] = []


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
    from nexus.control.commercial import seed_rows as seed_commercial  # after accounts (foreign keys)

    commercial = {"catalogue", "quotes", "subscriptions", "invoices", "payments", "credit_notes", "dunning", "usage"}
    seed_commercial(conn, fixtures.model_dump(include=commercial))
    from nexus.control.licences import seed_rows as seed_licences

    seed_licences(conn, fixtures.model_dump(include={"licences"}))
    from nexus.control.fleet import seed_rows as seed_fleet

    seed_fleet(conn, fixtures.model_dump(include={"deployments", "health_signals"}))
    from nexus.control.releases import seed_rows as seed_releases

    seed_releases(conn, fixtures.model_dump(include={"releases", "rollouts"}))
    from nexus.control.support import seed_rows as seed_support

    seed_support(conn, fixtures.model_dump(include={"tickets", "ticket_replies", "sla_policies", "kb_articles"}))
    return len(fixtures.staff)
