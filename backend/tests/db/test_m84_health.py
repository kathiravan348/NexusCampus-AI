"""Database tests for M84 health metrics (NEX-114): active user count function across tenants and queue depth."""

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import httpx2
from sqlalchemy import create_engine, text

from nexus.agent.health import measure_health
from nexus.control.fleet import HealthReport
from nexus.settings import Settings
from tests.db.conftest import DbUrls

# A timestamp well past the current wall clock isolates this test from sessions created by earlier tests in the
# session-scoped `test_db` while exercising the exact `last_seen_at > since` boundary.
TEST_NOW = datetime(2035, 1, 1, 12, 0, 0, tzinfo=UTC)


def test_active_users_function_counts_only_recent_sessions_across_tenants(test_db: DbUrls) -> None:
    owner = create_engine(test_db.owner_url)
    app = create_engine(test_db.app_url)
    session_ids = ("ses-m84-a1", "ses-m84-a2", "ses-m84-b1", "ses-m84-old")
    try:
        with owner.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT tenant_id, id FROM ("
                    "  SELECT tenant_id, id, row_number() OVER (PARTITION BY tenant_id ORDER BY id) AS rn"
                    "  FROM users"
                    ") ranked WHERE rn <= 2 ORDER BY tenant_id, id"
                )
            ).all()
            by_tenant: dict[str, list[str]] = {}
            for tenant_id, user_id in rows:
                by_tenant.setdefault(str(tenant_id), []).append(str(user_id))
            tenants = [t for t, users in by_tenant.items() if users]
            assert len(tenants) >= 2
            t_a, t_b = tenants[0], tenants[1]
            u_a = by_tenant[t_a][0]
            u_b = by_tenant[t_b][0]
            u_old = by_tenant[t_a][1] if len(by_tenant[t_a]) > 1 else by_tenant[t_b][1]
            t_old = t_a if len(by_tenant[t_a]) > 1 else t_b

            inserts = [
                ("ses-m84-a1", t_a, u_a, TEST_NOW - timedelta(minutes=5)),
                ("ses-m84-a2", t_a, u_a, TEST_NOW - timedelta(minutes=2)),  # duplicate user in same tenant
                ("ses-m84-b1", t_b, u_b, TEST_NOW - timedelta(minutes=10)),  # second tenant
                ("ses-m84-old", t_old, u_old, TEST_NOW - timedelta(minutes=25)),  # outside 15-minute window
            ]
            for sid, tid, uid, seen in inserts:
                conn.execute(
                    text(
                        "INSERT INTO sessions"
                        " (id, tenant_id, user_id, device_id, device_label, auth_method, mfa_verified,"
                        "  created_at, last_seen_at, expires_at)"
                        " VALUES (:id, :tid, :uid, 'dev-m84', 'Agent test', 'sso', true, :created, :seen, :exp)"
                    ),
                    {
                        "id": sid,
                        "tid": tid,
                        "uid": uid,
                        "created": seen - timedelta(minutes=5),
                        "seen": seen,
                        "exp": seen + timedelta(hours=4),
                    },
                )

        # Call as `nexus_app` without setting `app.tenant_id`: direct reads see 0 rows (RLS), function returns 2.
        with app.connect() as conn:
            direct_visible = int(conn.execute(text("SELECT count(*) FROM sessions")).scalar_one())
            assert direct_visible == 0
            active = int(
                conn.execute(
                    text("SELECT nexus_install_active_users(:since)"),
                    {"since": TEST_NOW - timedelta(minutes=15)},
                ).scalar_one()
            )
            assert active == 2
    finally:
        with owner.begin() as conn:
            conn.execute(text("DELETE FROM sessions WHERE id = ANY(:ids)"), {"ids": list(session_ids)})
        app.dispose()
        owner.dispose()


def test_measure_health_reads_queue_depth_and_active_users_as_nexus_app(test_db: DbUrls, tmp_path: Path) -> None:
    owner = create_engine(test_db.owner_url)
    app = create_engine(test_db.app_url)
    try:
        with owner.begin() as conn:
            row: Any = conn.execute(text("SELECT tenant_id, id FROM users ORDER BY id LIMIT 1")).one()
            conn.execute(
                text(
                    "INSERT INTO sessions"
                    " (id, tenant_id, user_id, device_id, device_label, auth_method, mfa_verified,"
                    "  created_at, last_seen_at, expires_at)"
                    " VALUES ('ses-m84-measure', :tid, :uid, 'dev-m84', 'Agent test', 'sso', true,"
                    "  :created, :seen, :exp)"
                ),
                {
                    "tid": row.tenant_id,
                    "uid": row.id,
                    "created": TEST_NOW - timedelta(minutes=10),
                    "seen": TEST_NOW - timedelta(minutes=3),
                    "exp": TEST_NOW + timedelta(hours=2),
                },
            )
            conn.execute(
                text(
                    "INSERT INTO install_backups (id, kind, status, encrypted, started_at)"
                    " VALUES ('bkp-m84-run', 'backup', 'running', true, :at)"
                ),
                {"at": TEST_NOW},
            )
            conn.execute(
                text(
                    "INSERT INTO install_backups (id, kind, status, encrypted, size_bytes, started_at, finished_at)"
                    " VALUES ('bkp-m84-done', 'backup', 'done', true, 128, :at, :at)"
                ),
                {"at": TEST_NOW},
            )
            conn.execute(
                text(
                    "INSERT INTO install_diagnostics (id, status, scrubbed, created_at)"
                    " VALUES ('diag-m84-gen', 'generating', true, :at),"
                    "        ('diag-m84-rev', 'ready_for_review', true, :at)"
                ),
                {"at": TEST_NOW},
            )

        settings = Settings(install_mode="self_hosted", install_dir=tmp_path, app_version="2.4.1", agent_probes=3)
        probe_transport = httpx2.MockTransport(lambda req: httpx2.Response(200, request=req))
        with app.connect() as conn:
            payload = measure_health(conn, settings, now=TEST_NOW, probe_transport=probe_transport)

        validated = HealthReport.model_validate(payload)
        assert validated.uptime_pct == 100.0
        assert validated.error_rate_pct == 0.0
        assert validated.queue_depth == 2
        assert validated.active_users == 1
    finally:
        with owner.begin() as conn:
            conn.execute(text("DELETE FROM sessions WHERE id = 'ses-m84-measure'"))
            conn.execute(text("DELETE FROM install_backups WHERE id IN ('bkp-m84-run', 'bkp-m84-done')"))
            conn.execute(text("DELETE FROM install_diagnostics WHERE id IN ('diag-m84-gen', 'diag-m84-rev')"))
        app.dispose()
        owner.dispose()
