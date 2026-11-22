"""P08 extensions, P15 projects, and P17 sandboxes API on the control database (NEX-123)."""

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


def by_key(rows: list[dict[str, Any]], key: str = "id") -> dict[str, dict[str, Any]]:
    return {r[key]: r for r in rows}


def compat_key(rows: list[dict[str, Any]]) -> dict[tuple[str, str], dict[str, Any]]:
    return {(r["extensionId"], r["releaseVersion"]): r for r in rows}


async def get(api: httpx2.AsyncClient, staff: str, path: str, **params: Any) -> httpx2.Response:
    return await api.get(f"{API}{path}", params=params, headers={"X-Nexus-Staff": staff})


@pytest.mark.anyio
async def test_lists_filters_details_and_404_match_fixtures(api: httpx2.AsyncClient) -> None:
    # Full lists match fixtures
    for path, staff, rows in [
        ("/extensions", RELEASE, FIX.extensions),
        ("/projects", IMPL, FIX.projects),
        ("/sandboxes", SALES, FIX.sandboxes),
    ]:
        res = await get(api, staff, path, pageSize=200)
        assert res.status_code == 200, path
        body = res.json()
        assert body["total"] == len(rows), path
        assert by_key(body["items"]) == by_key(rows), path

    compat = await get(api, RELEASE, "/extension-compatibility", pageSize=200)
    assert compat.status_code == 200 and compat.json()["total"] == len(FIX.compatibility)
    assert compat_key(compat.json()["items"]) == compat_key(FIX.compatibility)

    # Filters
    ext_nb = (await get(api, RELEASE, "/extensions", accountId="acc-nb")).json()["items"]
    assert [e["id"] for e in ext_nb] == ["ext-nb-grading"]

    c_warn = (
        await get(api, SUPPORT, "/extension-compatibility", extensionId="ext-nb-grading", result="warning")
    ).json()["items"]
    assert [c["extensionId"] for c in c_warn] == ["ext-nb-grading"]
    c_ver = (await get(api, SUPPORT, "/extension-compatibility", releaseVersion="2.5.0-rc.1")).json()["items"]
    assert len(c_ver) == 2

    p_live = (await get(api, IMPL, "/projects", status="live")).json()["items"]
    assert [p["id"] for p in p_live] == ["prj-al"]
    p_acc_kind = (await get(api, IMPL, "/projects", accountId="acc-sr", kind="onboarding")).json()["items"]
    assert [p["id"] for p in p_acc_kind] == ["prj-sr"]

    s_demo = (await get(api, SALES, "/sandboxes", kind="sales_demo", status="ready")).json()["items"]
    assert [s["id"] for s in s_demo] == ["sbx-demo-ey"]
    s_acc = (await get(api, SALES, "/sandboxes", accountId="acc-nb")).json()["items"]
    assert [s["id"] for s in s_acc] == ["sbx-stg-nb"]

    # Details & 404s
    assert (await get(api, RELEASE, "/extensions/ext-nb-grading")).json() == by_key(FIX.extensions)["ext-nb-grading"]
    assert (await get(api, RELEASE, "/extensions/ext-none")).status_code == 404
    assert (await get(api, IMPL, "/projects/prj-al")).json() == by_key(FIX.projects)["prj-al"]
    assert (await get(api, IMPL, "/projects/prj-none")).status_code == 404
    assert (await get(api, SALES, "/sandboxes/sbx-stg-nb")).json() == by_key(FIX.sandboxes)["sbx-stg-nb"]
    assert (await get(api, SALES, "/sandboxes/sbx-none")).status_code == 404


@pytest.mark.anyio
async def test_permissions_and_partner_scoping(api: httpx2.AsyncClient, control_db: tuple[str, str]) -> None:
    # Unauthenticated -> 401; roles without the read permission -> 403.
    for path in ("/extensions", "/extension-compatibility", "/projects", "/sandboxes"):
        assert (await api.get(f"{API}{path}")).status_code == 401
        assert (await get(api, BILLING, path)).status_code == 403
        assert (await get(api, PARTNER, path)).status_code == 403
    assert (await get(api, SALES, "/extensions")).status_code == 403
    assert (await get(api, SALES, "/projects")).status_code == 403
    assert (await get(api, SUPPORT, "/projects")).status_code == 403
    assert (await get(api, SUPPORT, "/sandboxes")).status_code == 403

    # Partner viewer with read roles sees only managed accounts' extensions/projects/sandboxes, no compatibility rows
    # and no unattached (account_id IS NULL) sandboxes.
    owner, _ = control_db
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO staff_users (id, display_name, work_email, roles, partner_id, mfa_enrolled, active) "
                    "VALUES ('stf-partner-del', 'Partner Del', 'pdel@eurolearn.example', "
                    "ARRAY['partner', 'support', 'implementation'], 'ptn-euro', true, true) "
                    "ON CONFLICT (id) DO NOTHING"
                )
            )
            # Add one extension and one sandbox on ptn-euro's account acc-al to verify positive + negative scoping.
            conn.execute(
                text(
                    "INSERT INTO extensions (id, account_id, code, name, version, signed, built_at) "
                    "VALUES ('ext-al-test', 'acc-al', 'al-sync', 'Alpine Sync', '1.0.0', true, '2026-09-01T00:00:00Z')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO sandboxes (id, kind, account_id, institution_type, region, data_kind, version, "
                    "status, created_at, expires_at) VALUES ('sbx-al-test', 'sales_demo', 'acc-al', 'sk', 'eu', "
                    "'synthetic', '2.4.1', 'ready', '2026-09-10T00:00:00Z', '2026-09-20T00:00:00Z')"
                )
            )

        exts = (await get(api, "stf-partner-del", "/extensions", pageSize=200)).json()["items"]
        assert [e["id"] for e in exts] == ["ext-al-test"]
        assert (await get(api, "stf-partner-del", "/extensions/ext-nb-grading")).status_code == 404

        compat = (await get(api, "stf-partner-del", "/extension-compatibility", pageSize=200)).json()
        assert compat["total"] == 0 and compat["items"] == []

        projs = (await get(api, "stf-partner-del", "/projects", pageSize=200)).json()["items"]
        assert [p["id"] for p in projs] == ["prj-al"]
        assert (await get(api, "stf-partner-del", "/projects/prj-sr")).status_code == 404

        sbxs = (await get(api, "stf-partner-del", "/sandboxes", pageSize=200)).json()["items"]
        assert [s["id"] for s in sbxs] == ["sbx-al-test"]
        assert (await get(api, "stf-partner-del", "/sandboxes/sbx-demo-tp")).status_code == 404
        assert (await get(api, "stf-partner-del", "/sandboxes/sbx-stg-nb")).status_code == 404
    finally:
        with eng.begin() as conn:
            conn.execute(text("DELETE FROM sandboxes WHERE id = 'sbx-al-test'"))
            conn.execute(text("DELETE FROM extensions WHERE id = 'ext-al-test'"))
            conn.execute(text("DELETE FROM staff_users WHERE id = 'stf-partner-del'"))
        eng.dispose()


def test_app_role_read_only_and_db_checks_refuse_invalid_rows(control_db: tuple[str, str]) -> None:
    owner_url, app_url = control_db
    app_eng = create_engine(app_url)
    try:
        for stmt in (
            "INSERT INTO extensions (id, account_id, code, name, version, signed, built_at) "
            "VALUES ('ext-x', 'acc-nb', 'x', 'X', '1.0.0', true, '2026-09-01T00:00:00Z')",
            "UPDATE extensions SET name = 'x'",
            "DELETE FROM extensions",
            "UPDATE extension_compatibility SET notes = 'x'",
            "DELETE FROM extension_compatibility",
            "UPDATE implementation_projects SET status = 'on_hold'",
            "DELETE FROM implementation_projects",
            "UPDATE sandboxes SET status = 'expired'",
            "DELETE FROM sandboxes",
        ):
            with pytest.raises(ProgrammingError), app_eng.begin() as conn:
                conn.execute(text(stmt))
    finally:
        app_eng.dispose()

    owner_eng = create_engine(owner_url)
    try:
        for bad_sql in (
            # Project live with an open (done=false) task -> refused by DB CHECK.
            "INSERT INTO implementation_projects (id, account_id, kind, status, lead_staff_id, go_live_date, "
            "tasks, plan_ai_drafted, created_at) VALUES ('prj-bad-open', 'acc-al', 'onboarding', 'live', 'stf-0023', "
            '\'2026-09-01\', \'[{"title":"Open","done":false,"due_date":null}]\'::jsonb, false, '
            "'2026-08-01T00:00:00Z')",
            # Project live without go_live_date -> refused by DB CHECK.
            "INSERT INTO implementation_projects (id, account_id, kind, status, lead_staff_id, go_live_date, "
            "tasks, plan_ai_drafted, created_at) VALUES ('prj-bad-date', 'acc-al', 'onboarding', 'live', 'stf-0023', "
            'NULL, \'[{"title":"Done","done":true,"due_date":null}]\'::jsonb, false, \'2026-08-01T00:00:00Z\')',
            # Sales demo with masked (non-synthetic) data -> refused by DB CHECK.
            "INSERT INTO sandboxes (id, kind, account_id, institution_type, region, data_kind, version, status, "
            "created_at, expires_at) VALUES ('sbx-bad-demo', 'sales_demo', 'acc-sr', 'ey', 'in', 'masked', '2.4.1', "
            "'ready', '2026-09-10T00:00:00Z', '2026-09-20T00:00:00Z')",
            # Staging clone without account_id -> refused by DB CHECK.
            "INSERT INTO sandboxes (id, kind, account_id, institution_type, region, data_kind, version, status, "
            "created_at, expires_at) VALUES ('sbx-bad-stg', 'staging_clone', NULL, 'he', 'us', 'masked', '2.4.1', "
            "'ready', '2026-09-10T00:00:00Z', '2026-09-20T00:00:00Z')",
            # Warning compatibility without notes -> refused by DB CHECK.
            "INSERT INTO extension_compatibility (extension_id, release_version, result, notes, ai_drafted, "
            "checked_at) VALUES ('ext-nb-grading', '2.6.0', 'warning', '   ', false, '2026-09-11T00:00:00Z')",
        ):
            with pytest.raises(IntegrityError), owner_eng.begin() as conn:
                conn.exec_driver_sql(bad_sql)
    finally:
        owner_eng.dispose()
