"""One agent run (NEX-105): counts per tenant, licence summary, update offer → the `install_status` row.

Runs as `nexus_app` (least privilege): tenant ids come from `nexus_audit_tenants()`, every count runs inside that
tenant's own context (`app.tenant_id`), and only counts are kept — never a name or a record (V-7).
"""

from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import Connection, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.sql.expression import bindparam

from nexus.agent.licence import check_licence, load_keys, read_only_summary
from nexus.agent.online import OnlineCheckResult
from nexus.agent.updates import RELEASE_KEYS, find_offer
from nexus.settings import Settings

_JSON = {"licence": JSONB(), "offer": JSONB()}


@dataclass(frozen=True)
class RunResult:
    tenants: int
    learners: int
    campuses: int
    licence_problem: str | None
    offer_version: str | None
    skipped: list[str]


def _in_tenant(conn: Connection, tenant_id: str) -> None:
    conn.execute(text("SELECT set_config('app.tenant_id', :t, true)"), {"t": tenant_id})


def count_and_entitle(conn: Connection) -> tuple[int, int, int]:
    """(tenants, active learners, campuses); gives every tenant the core M84 entitlement on the way."""
    tenants = [str(t) for t in conn.execute(text("SELECT * FROM nexus_audit_tenants()")).scalars()]
    learners = campuses = 0
    for tenant_id in tenants:
        _in_tenant(conn, tenant_id)
        learners += int(
            conn.execute(
                text("SELECT count(*) FROM role_profiles WHERE kind = 'learner' AND status = 'active'")
            ).scalar_one()
        )
        campuses += int(conn.execute(text("SELECT count(*) FROM campuses")).scalar_one())
        conn.execute(text("SELECT nexus_install_entitle()"))
    return len(tenants), learners, campuses


def run_once(
    conn: Connection,
    settings: Settings,
    today: date | None = None,
    online: OnlineCheckResult | None = None,
) -> RunResult:
    """Inside one transaction (the caller commits). A verified offline bundle beats an online offer."""
    day = today or datetime.now(UTC).date()
    tenants, learners, campuses = count_and_entitle(conn)
    licence = check_licence(settings.install_dir, day, learners, campuses)
    summary: dict[str, Any] = licence.summary or read_only_summary(learners, campuses, day)
    support_ends = date.fromisoformat(summary["supportEndsAt"]) if licence.summary else None
    keys_path = settings.install_dir / RELEASE_KEYS
    offline_offer, skipped = (
        (None, ["no pinned release keys"])
        if not keys_path.exists()
        else (find_offer(settings.install_dir, load_keys(keys_path), settings.app_version, support_ends))
    )
    telemetry = settings.telemetry_enabled and not settings.air_gapped
    online_offer = online.offer if (online is not None and not settings.air_gapped) else None
    offer = offline_offer if offline_offer is not None else online_offer
    checked_at = datetime.now(UTC) if (online is not None and online.checked and not settings.air_gapped) else None
    stmt = text(
        "INSERT INTO install_status (id, install_id, version, channel, licence, licence_problem, air_gapped,"
        " telemetry_enabled, last_update_check_at, last_backup_at, update_offer, checked_at)"
        " VALUES (1, :install, :version, :channel, :licence, :problem, :air, :telemetry, :update_check, NULL,"
        " :offer, now())"
        " ON CONFLICT (id) DO UPDATE SET install_id = EXCLUDED.install_id, version = EXCLUDED.version,"
        " channel = EXCLUDED.channel, licence = EXCLUDED.licence, licence_problem = EXCLUDED.licence_problem,"
        " air_gapped = EXCLUDED.air_gapped, telemetry_enabled = EXCLUDED.telemetry_enabled,"
        " last_update_check_at = CASE"
        "   WHEN EXCLUDED.air_gapped THEN NULL"
        "   WHEN EXCLUDED.last_update_check_at IS NOT NULL THEN EXCLUDED.last_update_check_at"
        "   ELSE install_status.last_update_check_at"
        " END,"
        " update_offer = EXCLUDED.update_offer, checked_at = EXCLUDED.checked_at"
    ).bindparams(bindparam("licence", type_=_JSON["licence"]), bindparam("offer", type_=_JSON["offer"]))
    conn.execute(
        stmt,
        {
            "install": settings.install_id,
            "version": settings.app_version,
            "channel": settings.release_channel,
            "licence": summary,
            "problem": licence.problem,
            "air": settings.air_gapped,
            "telemetry": telemetry,
            "update_check": checked_at,
            "offer": offer,
        },
    )
    return RunResult(tenants, learners, campuses, licence.problem, offer["version"] if offer else None, skipped)
