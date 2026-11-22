"""P14 compliance & trust API on the control database (NEX-126)."""

from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, ProgrammingError

from nexus.control.seed import load_fixtures

API = "/control/api/v1"
ADMIN, SALES, BILLING, SUPPORT, RELEASE, PARTNER = (
    "stf-0001",
    "stf-0011",
    "stf-0013",
    "stf-0042",
    "stf-0031",
    "stf-0051",
)
FIX = load_fixtures()


def by_id(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in rows}


async def get(api: httpx2.AsyncClient, staff: str, path: str, **params: Any) -> httpx2.Response:
    return await api.get(f"{API}{path}", params=params, headers={"X-Nexus-Staff": staff})


@pytest.mark.anyio
async def test_lists_filters_detail_paging_and_404_match_fixtures(api: httpx2.AsyncClient) -> None:
    collections = [
        ("/sub-processors", FIX.sub_processors),
        ("/certifications", FIX.certifications),
        ("/incidents", FIX.incidents),
        ("/dpas", FIX.dpas),
    ]
    for path, rows in collections:
        res = await get(api, ADMIN, path, pageSize=200)
        assert res.status_code == 200, path
        body = res.json()
        assert body["total"] == len(rows), path
        assert by_id(body["items"]) == by_id(rows), path

        # Walking one row per page yields the exact full set with no duplicates or skips.
        walked: list[dict[str, Any]] = []
        for page_num in range(1, len(rows) + 1):
            p = (await get(api, ADMIN, path, page=page_num, pageSize=1)).json()
            assert len(p["items"]) == 1 and p["total"] == len(rows)
            walked.extend(p["items"])
        assert len({r["id"] for r in walked}) == len(rows)
        assert by_id(walked) == by_id(rows), path

    # Filters
    sev2_res = (await get(api, ADMIN, "/incidents", status="resolved", severity="sev2")).json()["items"]
    assert [i["id"] for i in sev2_res] == ["inc-1015"]
    pm = (await get(api, ADMIN, "/incidents", status="post_mortem_done")).json()["items"]
    assert [i["id"] for i in pm] == ["inc-0902"]
    dpa_rv = (await get(api, ADMIN, "/dpas", accountId="acc-rv")).json()["items"]
    assert [d["id"] for d in dpa_rv] == ["dpa-rv"]

    # Detail & 404
    assert (await get(api, ADMIN, "/incidents/inc-0902")).json() == by_id(FIX.incidents)["inc-0902"]
    assert (await get(api, ADMIN, "/incidents/inc-none")).status_code == 404


@pytest.mark.anyio
async def test_permissions_and_partner_scoping(api: httpx2.AsyncClient, control_db: tuple[str, str]) -> None:
    # Unauthenticated -> 401; roles without ctl.trust.read -> 403.
    for path in ("/sub-processors", "/certifications", "/incidents", "/dpas"):
        assert (await api.get(f"{API}{path}")).status_code == 401
        for caller in (SALES, BILLING, SUPPORT, RELEASE, PARTNER):
            assert (await get(api, caller, path)).status_code == 403, (caller, path)

    # Partner viewer with security_officer sees only its accounts' DPAs, and no sub-processors, certs, or incidents.
    owner, _ = control_db
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO staff_users (id, display_name, work_email, roles, partner_id, mfa_enrolled, active) "
                    "VALUES ('stf-partner-tr', 'Partner Trust', 'ptr@southern.example', "
                    "ARRAY['partner', 'security_officer'], 'ptn-south', true, true) "
                    "ON CONFLICT (id) DO NOTHING"
                )
            )

        for hidden in ("/sub-processors", "/certifications", "/incidents"):
            body = (await get(api, "stf-partner-tr", hidden, pageSize=200)).json()
            assert body["total"] == 0 and body["items"] == [], hidden
        assert (await get(api, "stf-partner-tr", "/incidents/inc-0902")).status_code == 404

        dpas = (await get(api, "stf-partner-tr", "/dpas", pageSize=200)).json()["items"]
        assert [d["id"] for d in dpas] == ["dpa-ax"]
        assert (await get(api, "stf-partner-tr", "/dpas", accountId="acc-rv")).json()["total"] == 0
    finally:
        with eng.begin() as conn:
            conn.execute(text("DELETE FROM staff_users WHERE id = 'stf-partner-tr'"))
        eng.dispose()


def test_app_role_read_only_and_db_checks_refuse_invalid_rows(control_db: tuple[str, str]) -> None:
    owner_url, app_url = control_db
    app_eng = create_engine(app_url)
    try:
        for stmt in (
            "INSERT INTO sub_processors (id, name, purpose, country, dpa_signed, touches_institution_data) "
            "VALUES ('sp-x', 'X', 'Test', 'IN', true, false)",
            "UPDATE sub_processors SET dpa_signed = false",
            "DELETE FROM sub_processors",
            "UPDATE certifications SET status = 'lapsed'",
            "DELETE FROM certifications",
            "UPDATE security_incidents SET status = 'resolved'",
            "DELETE FROM security_incidents",
            "UPDATE dpa_records SET version = '3.0'",
            "DELETE FROM dpa_records",
        ):
            with pytest.raises(ProgrammingError), app_eng.begin() as conn:
                conn.execute(text(stmt))
    finally:
        app_eng.dispose()

    owner_eng = create_engine(owner_url)
    try:
        for bad_sql in (
            # Certified without valid_until -> refused.
            "INSERT INTO certifications (id, code, status, valid_until) "
            "VALUES ('crt-bad-1', 'soc2', 'certified', NULL)",
            # Non-certified with valid_until -> refused.
            "INSERT INTO certifications (id, code, status, valid_until) "
            "VALUES ('crt-bad-2', 'soc2', 'planned', '2028-01-01')",
            # Personal data affected without breach notification deadline -> refused.
            "INSERT INTO security_incidents (id, title, severity, status, affected_account_ids, "
            "personal_data_affected, detected_at, breach_notification_due_at, notified_at, report_ai_drafted) "
            "VALUES ('inc-bad-due', 'Leak', 'sev1', 'investigating', ARRAY['acc-nb'], true, "
            "'2026-10-01T09:00:00Z', NULL, NULL, false)",
            # Breach deadline before detection -> refused.
            "INSERT INTO security_incidents (id, title, severity, status, affected_account_ids, "
            "personal_data_affected, detected_at, breach_notification_due_at, notified_at, report_ai_drafted) "
            "VALUES ('inc-bad-order', 'Leak', 'sev1', 'investigating', ARRAY['acc-nb'], true, "
            "'2026-10-01T09:00:00Z', '2026-10-01T08:00:00Z', NULL, false)",
            # Notified when personal_data_affected is false -> refused.
            "INSERT INTO security_incidents (id, title, severity, status, affected_account_ids, "
            "personal_data_affected, detected_at, breach_notification_due_at, notified_at, report_ai_drafted) "
            "VALUES ('inc-bad-notif', 'Outage', 'sev3', 'resolved', ARRAY['acc-nb'], false, "
            "'2026-10-01T09:00:00Z', NULL, '2026-10-01T10:00:00Z', false)",
            # Duplicate affected_account_ids -> refused.
            "INSERT INTO security_incidents (id, title, severity, status, affected_account_ids, "
            "personal_data_affected, detected_at, breach_notification_due_at, notified_at, report_ai_drafted) "
            "VALUES ('inc-bad-dup', 'Dup', 'sev3', 'resolved', ARRAY['acc-nb', 'acc-nb'], false, "
            "'2026-10-01T09:00:00Z', NULL, NULL, false)",
        ):
            with pytest.raises(IntegrityError), owner_eng.begin() as conn:
                conn.exec_driver_sql(bad_sql)
    finally:
        owner_eng.dispose()
