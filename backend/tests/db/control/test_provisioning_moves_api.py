"""P04 provisioning, offboarding & shred certificates, P18 moves API on the control DB (NEX-121)."""

from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError, ProgrammingError

from nexus.control.seed import load_fixtures

API = "/control/api/v1"
ADMIN, SALES, BILLING, IMPL, RELEASE, SUPPORT, PARTNER = (
    "stf-0001",
    "stf-0011",
    "stf-0013",
    "stf-0023",
    "stf-0031",
    "stf-0042",
    "stf-0051",
)
FIX = load_fixtures()


def by_id(rows: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {r["id"]: r for r in rows}


async def get(api: httpx2.AsyncClient, staff: str, path: str, **params: Any) -> httpx2.Response:
    return await api.get(f"{API}{path}", params=params, headers={"X-Nexus-Staff": staff})


@pytest.mark.anyio
async def test_lists_filters_details_paging_and_writes_not_mounted(api: httpx2.AsyncClient) -> None:
    collections = [
        ("/provisioning-jobs", FIX.provisioning_jobs),
        ("/offboarding-jobs", FIX.offboarding_jobs),
        ("/shred-certificates", FIX.shred_certificates),
        ("/portability-jobs", FIX.portability_jobs),
    ]
    for path, rows in collections:
        res = await get(api, IMPL, path, pageSize=200)
        assert res.status_code == 200, path
        body = res.json()
        assert body["total"] == len(rows), path
        assert by_id(body["items"]) == by_id(rows), path

        # Stable one-row-per-page walk yields exact full set.
        walked: list[dict[str, Any]] = []
        for page_num in range(1, len(rows) + 1):
            p = (await get(api, IMPL, path, page=page_num, pageSize=1)).json()
            assert len(p["items"]) == 1 and p["total"] == len(rows)
            walked.extend(p["items"])
        assert len({r["id"] for r in walked}) == len(rows) and by_id(walked) == by_id(rows)

    # Filters
    assert [j["id"] for j in (await get(api, IMPL, "/provisioning-jobs", status="running")).json()["items"]] == [
        "prv-sr"
    ]
    assert [
        j["id"] for j in (await get(api, IMPL, "/offboarding-jobs", accountId="acc-om", status="done")).json()["items"]
    ] == ["off-om"]
    assert [c["id"] for c in (await get(api, IMPL, "/shred-certificates", tenantId="ten-om")).json()["items"]] == [
        "shc-om"
    ]
    assert [
        j["id"]
        for j in (
            await get(
                api, IMPL, "/portability-jobs", accountId="acc-rv", status="running", direction="saas_to_self_hosted"
            )
        ).json()["items"]
    ] == ["mov-rv"]

    # Details & 404s
    for path, row in [
        ("/provisioning-jobs/prv-hm", by_id(FIX.provisioning_jobs)["prv-hm"]),
        ("/offboarding-jobs/off-om", by_id(FIX.offboarding_jobs)["off-om"]),
        ("/shred-certificates/shc-om", by_id(FIX.shred_certificates)["shc-om"]),
        ("/portability-jobs/mov-ct", by_id(FIX.portability_jobs)["mov-ct"]),
    ]:
        assert (await get(api, IMPL, path)).json() == row
        prefix = path.rsplit("/", 1)[0]
        assert (await get(api, IMPL, f"{prefix}/missing-id")).status_code == 404

    # Writes are NOT mounted yet (NEX-127): POST /provisioning-jobs -> 405, POST .../advance -> 404.
    assert (await api.post(f"{API}/provisioning-jobs", json={}, headers={"X-Nexus-Staff": IMPL})).status_code == 405
    assert (
        await api.post(f"{API}/provisioning-jobs/prv-sr/advance", headers={"X-Nexus-Staff": IMPL})
    ).status_code == 404


@pytest.mark.anyio
async def test_permissions_and_partner_scoping(api: httpx2.AsyncClient, control_db: tuple[str, str]) -> None:
    for path in ("/provisioning-jobs", "/offboarding-jobs", "/shred-certificates", "/portability-jobs"):
        assert (await api.get(f"{API}{path}")).status_code == 401
        for caller in (SALES, BILLING, SUPPORT, RELEASE, PARTNER):
            assert (await get(api, caller, path)).status_code == 403, (caller, path)

    # Partner viewer with implementation role sees ONLY its accounts' offboarding & portability jobs;
    # provisioning jobs and shred certificates remain hidden (exact mock rule).
    owner, _ = control_db
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO staff_users (id, display_name, work_email, roles, partner_id, mfa_enrolled, active) "
                    "VALUES ('stf-partner-pr', 'Partner Prov', 'pprov@southern.example', "
                    "ARRAY['partner', 'implementation'], 'ptn-south', true, true) ON CONFLICT (id) DO NOTHING"
                )
            )
            conn.exec_driver_sql(
                "INSERT INTO offboarding_jobs (id, account_id, tenant_id, steps, status, shred_certificate_id, "
                "requested_by_staff_id, created_at) VALUES ('off-ax-test', 'acc-ax', 'ten-ax', "
                '\'[{"name":"freeze_writes","status":"running"},{"name":"export_ready","status":"pending"},'
                '{"name":"export_downloaded","status":"pending"},{"name":"keys_destroyed","status":"pending"},'
                '{"name":"certificate_issued","status":"pending"}]\'::jsonb, \'running\', NULL, \'stf-0023\', '
                "'2026-09-15T00:00:00Z')"
            )
            conn.exec_driver_sql(
                "INSERT INTO portability_jobs (id, account_id, tenant_id, direction, from_region, to_region, steps, "
                "status, encrypted, created_at) VALUES ('mov-ax-test', 'acc-ax', 'ten-ax', 'region_move', 'in', 'eu', "
                '\'[{"name":"preflight","status":"running"},{"name":"export_encrypted","status":"pending"},'
                '{"name":"transfer","status":"pending"},{"name":"import","status":"pending"},'
                '{"name":"verify","status":"pending"},{"name":"cutover","status":"pending"},'
                '{"name":"shred_source","status":"pending"}]\'::jsonb, \'running\', true, \'2026-09-15T00:00:00Z\')'
            )

        assert (await get(api, "stf-partner-pr", "/provisioning-jobs")).json()["total"] == 0
        assert (await get(api, "stf-partner-pr", "/provisioning-jobs/prv-hm")).status_code == 404
        assert (await get(api, "stf-partner-pr", "/shred-certificates")).json()["total"] == 0
        assert (await get(api, "stf-partner-pr", "/shred-certificates/shc-om")).status_code == 404

        off = (await get(api, "stf-partner-pr", "/offboarding-jobs", pageSize=200)).json()["items"]
        assert [j["id"] for j in off] == ["off-ax-test"]
        assert (await get(api, "stf-partner-pr", "/offboarding-jobs/off-om")).status_code == 404

        mov = (await get(api, "stf-partner-pr", "/portability-jobs", pageSize=200)).json()["items"]
        assert [j["id"] for j in mov] == ["mov-ax-test"]
        assert (await get(api, "stf-partner-pr", "/portability-jobs/mov-ct")).status_code == 404
    finally:
        with eng.begin() as conn:
            conn.execute(text("DELETE FROM portability_jobs WHERE id = 'mov-ax-test'"))
            conn.execute(text("DELETE FROM offboarding_jobs WHERE id = 'off-ax-test'"))
            conn.execute(text("DELETE FROM staff_users WHERE id = 'stf-partner-pr'"))
        eng.dispose()


def test_app_role_read_only_and_db_checks_refuse_invalid_rows(control_db: tuple[str, str]) -> None:
    owner_url, app_url = control_db
    app_eng = create_engine(app_url)
    try:
        for stmt in (
            "UPDATE provisioning_jobs SET status = 'done'",
            "DELETE FROM provisioning_jobs",
            "UPDATE offboarding_jobs SET status = 'failed'",
            "DELETE FROM offboarding_jobs",
            "UPDATE shred_certificates SET signing_key_id = 'x'",
            "DELETE FROM shred_certificates",
            "UPDATE portability_jobs SET status = 'done'",
            "DELETE FROM portability_jobs",
        ):
            with pytest.raises(ProgrammingError), app_eng.begin() as conn:
                conn.execute(text(stmt))
    finally:
        app_eng.dispose()

    owner_eng = create_engine(owner_url)
    try:
        for bad_sql in (
            # Job status contradicts its steps (status='done' with a pending step) -> refused.
            "INSERT INTO provisioning_jobs (id, request_account_id, request_region, request_institution_type, "
            "request_plan_code, request_trial_days, request_delivery_model, steps, status, tenant_id, "
            "requested_by_staff_id, created_at) VALUES ('prv-bad-st', 'acc-sr', 'in', 'ey', 'standard', 30, "
            "'saas_shared', "
            '\'[{"name":"create_tenant","status":"done"},{"name":"create_keys","status":"pending"},'
            '{"name":"apply_profile","status":"pending"},{"name":"seed","status":"pending"},'
            '{"name":"invite_owner","status":"pending"}]\'::jsonb, \'done\', \'ten-x\', \'stf-0023\', '
            "'2026-09-15T00:00:00Z')",
            # Region move within the same region (in -> in) -> refused.
            "INSERT INTO portability_jobs (id, account_id, tenant_id, direction, from_region, to_region, steps, "
            "status, encrypted, created_at) VALUES ('mov-bad-reg', 'acc-rv', 'ten-rv', 'region_move', 'in', 'in', "
            '\'[{"name":"preflight","status":"running"},{"name":"export_encrypted","status":"pending"},'
            '{"name":"transfer","status":"pending"},{"name":"import","status":"pending"},'
            '{"name":"verify","status":"pending"},{"name":"cutover","status":"pending"},'
            '{"name":"shred_source","status":"pending"}]\'::jsonb, \'running\', true, \'2026-09-15T00:00:00Z\')',
            # Short Ed25519 signature -> refused.
            "INSERT INTO shred_certificates (id, tenant_id, key_ids, destroyed_at, signing_key_id, signature) "
            "VALUES ('shc-bad-sig', 'ten-x', ARRAY['key-1'], '2026-09-15T00:00:00Z', 'nexus-shred-2026', 'short')",
            # Missing shred_certificate_id when certificate_issued is done -> refused.
            "INSERT INTO offboarding_jobs (id, account_id, tenant_id, steps, status, shred_certificate_id, "
            "requested_by_staff_id, created_at) VALUES ('off-bad-cert', 'acc-om', 'ten-x', "
            '\'[{"name":"freeze_writes","status":"done"},{"name":"export_ready","status":"done"},'
            '{"name":"export_downloaded","status":"done"},{"name":"keys_destroyed","status":"done"},'
            '{"name":"certificate_issued","status":"done"}]\'::jsonb, \'done\', NULL, \'stf-0023\', '
            "'2026-09-15T00:00:00Z')",
        ):
            with pytest.raises(IntegrityError), owner_eng.begin() as conn:
                conn.exec_driver_sql(bad_sql)
    finally:
        owner_eng.dispose()
