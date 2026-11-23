"""P10 access broker API, signed D60 command queuing, and agent decision reporting tests (NEX-125)."""

from datetime import UTC, datetime
from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

from nexus.commands.format import DEFAULT_KEY, load_public_keys, public_key_file, verify_command
from nexus.control.seed import load_fixtures
from nexus.core.vault import FakeVault
from nexus.devtools.agent_token import issue_token

API = "/control/api/v1"
ADMIN, SUPPORT, SALES, PARTNER = "stf-0001", "stf-0042", "stf-0011", "stf-0051"
FIX = load_fixtures()


def by_key(rows: list[dict[str, Any]], key: str) -> dict[str, dict[str, Any]]:
    return {r[key]: r for r in rows}


async def get(api: httpx2.AsyncClient, staff: str, path: str, **params: Any) -> httpx2.Response:
    return await api.get(f"{API}{path}", params=params, headers={"X-Nexus-Staff": staff})


@pytest.mark.anyio
async def test_broker_reads_filters_partner_scoping_and_permissions(
    api: httpx2.AsyncClient, control_db: tuple[str, str]
) -> None:
    owner, app_url = control_db
    reqs = (await get(api, ADMIN, "/broker-requests", pageSize=200)).json()
    assert reqs["total"] == len(FIX.broker_requests)
    assert by_key(reqs["items"], "id") == by_key(FIX.broker_requests, "id")

    sess = (await get(api, SUPPORT, "/broker-sessions", pageSize=200)).json()
    assert sess["total"] == len(FIX.broker_sessions)
    assert by_key(sess["items"], "id") == by_key(FIX.broker_sessions, "id")

    bg = (await get(api, ADMIN, "/break-glass-cases", pageSize=200)).json()
    assert bg["total"] == len(FIX.break_glass_cases)
    assert by_key(bg["items"], "id") == by_key(FIX.break_glass_cases, "id")

    # Filters and detail
    by_acc = (await get(api, ADMIN, "/broker-requests", accountId="acc-ls")).json()["items"]
    assert all(r["accountId"] == "acc-ls" for r in by_acc) and len(by_acc) >= 1
    one_bg = (await get(api, ADMIN, "/break-glass-cases/bgn-nb-0902")).json()
    assert one_bg["accountId"] == "acc-nb"
    assert (await get(api, ADMIN, "/broker-requests/acr-missing")).status_code == 404

    # Deny by default
    assert (await get(api, SALES, "/broker-requests")).status_code == 403
    assert (await get(api, SALES, "/broker-sessions")).status_code == 403
    assert (await get(api, SALES, "/break-glass-cases")).status_code == 403
    assert (await api.get(f"{API}/broker-requests")).status_code == 401

    # Partner with ctl.broker.read sees only own accounts' requests and break-glass cases, never broker sessions
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO staff_users (id, display_name, work_email, roles, partner_id, mfa_enrolled, active) "
                    "VALUES ('stf-partner-brk', 'Partner Brk', 'pbrk@southern.example', ARRAY['partner', 'support'], "
                    "'ptn-south', true, true) ON CONFLICT (id) DO NOTHING"
                )
            )
    finally:
        eng.dispose()
    p_sess = (await get(api, "stf-partner-brk", "/broker-sessions")).json()["items"]
    assert p_sess == []
    p_bg = (await get(api, "stf-partner-brk", "/break-glass-cases")).json()["items"]
    assert all(c["accountId"] != "acc-nb" for c in p_bg)

    # control_app cannot write broker_sessions or break_glass_cases
    app_eng = create_engine(app_url)
    try:
        for sql in (
            "DELETE FROM broker_sessions",
            "UPDATE broker_sessions SET actions_count = 99 WHERE id = 'bss-ax-0915'",
            "DELETE FROM break_glass_cases",
            "UPDATE break_glass_cases SET closed_at = now() WHERE id = 'bgn-nb-0902'",
        ):
            with pytest.raises(ProgrammingError), app_eng.begin() as conn:
                conn.execute(text(sql))
    finally:
        app_eng.dispose()


@pytest.mark.anyio
async def test_create_broker_request_command_routing_and_decisions(
    api: httpx2.AsyncClient, control_db: tuple[str, str], fake_vault: FakeVault
) -> None:
    owner, _ = control_db
    # Permission denied & M83 -> 422
    payload_ls: dict[str, Any] = {
        "accountId": "acc-ls",
        "tenantId": "ten-ls",
        "ticketId": None,
        "reason": "Inspect notification templates for ticket troubleshooting.",
        "modules": ["M07"],
        "mode": "read",
        "durationHours": 12,
    }
    assert (
        await api.post(f"{API}/broker-requests", headers={"X-Nexus-Staff": SALES}, json=payload_ls)
    ).status_code == 403
    r_m83 = await api.post(
        f"{API}/broker-requests",
        headers={"X-Nexus-Staff": SUPPORT},
        json={**payload_ls, "modules": ["M07", "M83"]},
    )
    assert r_m83.status_code == 422

    # Shared cell routing (acc-ls -> dep-in-1)
    r_ls = await api.post(f"{API}/broker-requests", headers={"X-Nexus-Staff": SUPPORT}, json=payload_ls)
    assert r_ls.status_code == 201
    req_ls = r_ls.json()
    assert req_ls["status"] == "pending" and req_ls["id"].startswith("acr-")

    # Dedicated cell routing (acc-nb -> dep-us-nb)
    r_nb = await api.post(
        f"{API}/broker-requests",
        headers={"X-Nexus-Staff": SUPPORT},
        json={**payload_ls, "accountId": "acc-nb", "tenantId": "ten-nb"},
    )
    assert r_nb.status_code == 201
    req_nb = r_nb.json()

    # Self-hosted account -> 409
    r_sh = await api.post(
        f"{API}/broker-requests",
        headers={"X-Nexus-Staff": SUPPORT},
        json={**payload_ls, "accountId": "acc-ct", "tenantId": "ten-ct"},
    )
    assert r_sh.status_code == 409

    # Unknown deployment (region 'us' has no shared cell) -> 409
    eng = create_engine(owner)
    try:
        with eng.begin() as conn:
            conn.execute(text("UPDATE accounts SET region = 'us' WHERE id = 'acc-sr'"))
        r_nodep = await api.post(
            f"{API}/broker-requests",
            headers={"X-Nexus-Staff": SUPPORT},
            json={**payload_ls, "accountId": "acc-sr", "tenantId": "ten-sr"},
        )
        assert r_nodep.status_code == 409
    finally:
        with eng.begin() as conn:
            conn.execute(text("UPDATE accounts SET region = 'in' WHERE id = 'acc-sr'"))
        eng.dispose()

    # Verify signed commands exist for dep-in-1 and dep-us-nb
    tok_in = issue_token(owner, "dep-in-1")
    tok_nb = issue_token(owner, "dep-us-nb")
    keys = load_public_keys(await public_key_file(fake_vault, DEFAULT_KEY))

    cmds_in = (await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_in}"})).json()["items"]
    ver_in = verify_command(cmds_in[0]["command"], cmds_in[0]["signature"], keys)
    assert ver_in.kind == "access_request.file" and ver_in.deployment_id == "dep-in-1"
    assert ver_in.args["requestId"] == req_ls["id"] and "(Nexus Support)" in ver_in.args["staffDisplayName"]

    cmds_nb = (await api.get(f"{API}/agent/commands", headers={"Authorization": f"Bearer {tok_nb}"})).json()["items"]
    ver_nb = verify_command(cmds_nb[0]["command"], cmds_nb[0]["signature"], keys)
    assert ver_nb.deployment_id == "dep-us-nb" and ver_nb.args["requestId"] == req_nb["id"]

    # Wrong deployment decision is ignored
    now_iso = datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    r_wrong = await api.post(
        f"{API}/agent/access-decisions",
        headers={"Authorization": f"Bearer {tok_nb}"},
        json={"items": [{"requestId": req_ls["id"], "status": "approved", "decidedAt": now_iso}]},
    )
    assert r_wrong.status_code == 200 and r_wrong.json() == {"updated": 0, "ignored": 1}

    # Right deployment approves -> updated; repeated denied is ignored; revoked follows approved!
    r_app = await api.post(
        f"{API}/agent/access-decisions",
        headers={"Authorization": f"Bearer {tok_in}"},
        json={"items": [{"requestId": req_ls["id"], "status": "approved", "decidedAt": now_iso}]},
    )
    assert r_app.status_code == 200 and r_app.json() == {"updated": 1, "ignored": 0}
    assert (await get(api, ADMIN, f"/broker-requests/{req_ls['id']}")).json()["status"] == "approved"

    r_dup = await api.post(
        f"{API}/agent/access-decisions",
        headers={"Authorization": f"Bearer {tok_in}"},
        json={"items": [{"requestId": req_ls["id"], "status": "denied", "decidedAt": now_iso}]},
    )
    assert r_dup.json() == {"updated": 0, "ignored": 1}

    r_rev = await api.post(
        f"{API}/agent/access-decisions",
        headers={"Authorization": f"Bearer {tok_in}"},
        json={"items": [{"requestId": req_ls["id"], "status": "revoked", "decidedAt": now_iso}]},
    )
    assert r_rev.json() == {"updated": 1, "ignored": 0}
    assert (await get(api, ADMIN, f"/broker-requests/{req_ls['id']}")).json()["status"] == "revoked"

    # expired maps to ended
    r_exp = await api.post(
        f"{API}/agent/access-decisions",
        headers={"Authorization": f"Bearer {tok_nb}"},
        json={"items": [{"requestId": req_nb["id"], "status": "expired", "decidedAt": now_iso}]},
    )
    assert r_exp.json() == {"updated": 1, "ignored": 0}
    assert (await get(api, ADMIN, f"/broker-requests/{req_nb['id']}")).json()["status"] == "ended"
