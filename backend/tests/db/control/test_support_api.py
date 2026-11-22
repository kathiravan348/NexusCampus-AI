"""P09 support desk API on the control database (NEX-122): reads, partner scoping, staff replies, app-role limits."""

import logging
from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError

from nexus.control.seed import load_fixtures

API = "/control/api/v1"
ADMIN, SALES, BILLING, IMPL, SUPPORT, PARTNER = (
    "stf-0001",
    "stf-0011",
    "stf-0013",
    "stf-0023",
    "stf-0042",
    "stf-0051",
)
FIX = load_fixtures()


def by_key(rows: list[dict[str, Any]], key: str = "id") -> dict[str, dict[str, Any]]:
    return {r[key]: r for r in rows}


async def get(api: httpx2.AsyncClient, staff: str, path: str, **params: Any) -> httpx2.Response:
    return await api.get(f"{API}{path}", params=params, headers={"X-Nexus-Staff": staff})


async def post(api: httpx2.AsyncClient, staff: str, path: str, body: Any) -> httpx2.Response:
    return await api.post(f"{API}{path}", json=body, headers={"X-Nexus-Staff": staff})


@pytest.mark.anyio
async def test_lists_filters_details_and_404_match_fixtures(api: httpx2.AsyncClient) -> None:
    for path, rows, key in [
        ("/tickets", FIX.tickets, "id"),
        ("/ticket-replies", FIX.ticket_replies, "id"),
        ("/sla-policies", FIX.sla_policies, "slaTier"),
        ("/kb-articles", FIX.kb_articles, "id"),
    ]:
        res = await get(api, SUPPORT, path, pageSize=200)
        assert res.status_code == 200, path
        body = res.json()
        assert body["total"] == len(rows), path
        assert by_key(body["items"], key) == by_key(rows, key), path

    # Filters
    open_tickets = (await get(api, SUPPORT, "/tickets", status="open")).json()["items"]
    assert open_tickets and all(t["status"] == "open" for t in open_tickets)
    p2 = (await get(api, SUPPORT, "/tickets", priority="p2")).json()["items"]
    assert p2 and all(t["priority"] == "p2" for t in p2)
    by_acc = (await get(api, SUPPORT, "/tickets", accountId="acc-ax")).json()["items"]
    assert [t["id"] for t in by_acc] == ["tck-0915"]
    by_assignee = (await get(api, SUPPORT, "/tickets", assigneeStaffId=SUPPORT)).json()["items"]
    assert by_assignee and all(t["assigneeStaffId"] == SUPPORT for t in by_assignee)

    reps = (await get(api, SUPPORT, "/ticket-replies", ticketId="tck-0915")).json()["items"]
    assert len(reps) == len(FIX.ticket_replies)
    assert (await get(api, SUPPORT, "/ticket-replies", ticketId="tck-0914")).json()["total"] == 0

    ta_kb = (await get(api, SUPPORT, "/kb-articles", locale="ta", slug="approve-support-access")).json()["items"]
    assert [a["id"] for a in ta_kb] == ["kb-access-ta"]

    # Details & 404s
    assert (await get(api, SUPPORT, "/tickets/tck-0915")).json() == by_key(FIX.tickets)["tck-0915"]
    assert (await get(api, SUPPORT, "/tickets/tck-none")).status_code == 404
    assert (await get(api, SUPPORT, "/sla-policies/enterprise")).json() == by_key(FIX.sla_policies, "slaTier")[
        "enterprise"
    ]
    assert (await get(api, SUPPORT, "/sla-policies/gold")).status_code == 404
    assert (await get(api, SUPPORT, "/kb-articles/kb-access")).json() == by_key(FIX.kb_articles)["kb-access"]
    assert (await get(api, SUPPORT, "/kb-articles/kb-none")).status_code == 404


@pytest.mark.anyio
async def test_permissions_and_partner_scoping(api: httpx2.AsyncClient) -> None:
    # Unauthenticated -> 401; roles without ctl.ticket.read -> 403.
    assert (await api.get(f"{API}/tickets")).status_code == 401
    for path in ("/tickets", "/ticket-replies", "/sla-policies", "/kb-articles"):
        assert (await get(api, SALES, path)).status_code == 403, path
        assert (await get(api, BILLING, path)).status_code == 403, path

    # Partner sees only its managed accounts' tickets & joined replies; no SLA policies or KB articles.
    me = (await get(api, PARTNER, "/me")).json()
    partner_id = me["staff"]["partnerId"]
    own_accounts = {a["id"] for a in FIX.accounts if a["partnerId"] == partner_id}
    own_tickets = {t["id"] for t in FIX.tickets if t["accountId"] in own_accounts}
    assert own_tickets

    p_tickets = (await get(api, PARTNER, "/tickets", pageSize=200)).json()["items"]
    assert {t["id"] for t in p_tickets} == own_tickets
    other_ticket = next(t["id"] for t in FIX.tickets if t["id"] not in own_tickets)
    assert (await get(api, PARTNER, f"/tickets/{other_ticket}")).status_code == 404

    p_replies = (await get(api, PARTNER, "/ticket-replies", pageSize=200)).json()["items"]
    assert p_replies and {r["ticketId"] for r in p_replies} <= own_tickets
    assert (await get(api, PARTNER, "/ticket-replies", ticketId=other_ticket)).json()["total"] == 0

    assert (await get(api, PARTNER, "/sla-policies")).json()["total"] == 0
    assert (await get(api, PARTNER, "/sla-policies/standard")).status_code == 404
    assert (await get(api, PARTNER, "/kb-articles")).json()["total"] == 0
    assert (await get(api, PARTNER, "/kb-articles/kb-access")).status_code == 404


@pytest.mark.anyio
async def test_staff_replies_status_rules_errors_and_logging(
    api: httpx2.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    caplog.set_level(logging.INFO, logger="nexus.control.support")
    note_body = "Investigating cache invalidation on cell-in-1."

    # 1. Internal note on a `new` unassigned ticket -> opens it and assigns to replier.
    r1 = await post(api, SUPPORT, "/tickets/tck-0915b/replies", {"body": f"  {note_body}  ", "internal": True})
    assert r1.status_code == 201
    rep1 = r1.json()
    assert rep1["id"].startswith("rep-")
    assert (
        rep1["ticketId"],
        rep1["authorKind"],
        rep1["authorStaffId"],
        rep1["body"],
        rep1["internal"],
        rep1["aiDrafted"],
    ) == (
        "tck-0915b",
        "staff",
        SUPPORT,
        note_body,
        True,
        False,
    )
    tk_new = (await get(api, SUPPORT, "/tickets/tck-0915b")).json()
    assert (tk_new["status"], tk_new["assigneeStaffId"], tk_new["resolvedAt"]) == ("open", SUPPORT, None)
    # Logs contain ids only — never the reply text.
    assert any(
        "tck-0915b" in rec.message and rep1["id"] in rec.message and SUPPORT in rec.message for rec in caplog.records
    )
    assert all(note_body not in rec.message for rec in caplog.records)

    # 2. Public reply on an `open` ticket -> waiting_customer, keeps existing assignee.
    r2 = await post(api, ADMIN, "/tickets/tck-0915/replies", {"body": "Please retry now.", "internal": False})
    assert r2.status_code == 201
    tk_open = (await get(api, ADMIN, "/tickets/tck-0915")).json()
    assert (tk_open["status"], tk_open["assigneeStaffId"], tk_open["resolvedAt"]) == ("waiting_customer", SUPPORT, None)

    # 3. Internal note on `resolved` keeps status + `resolvedAt`; public reply clears `resolvedAt`.
    before = (await get(api, SUPPORT, "/tickets/tck-0905")).json()
    assert before["status"] == "resolved" and before["resolvedAt"] is not None
    assert (
        await post(api, SUPPORT, "/tickets/tck-0905/replies", {"body": "Post-mortem link.", "internal": True})
    ).status_code == 201
    after_int = (await get(api, SUPPORT, "/tickets/tck-0905")).json()
    assert (after_int["status"], after_int["resolvedAt"]) == ("resolved", before["resolvedAt"])
    assert (
        await post(api, SUPPORT, "/tickets/tck-0905/replies", {"body": "Re-checking with you.", "internal": False})
    ).status_code == 201
    after_pub = (await get(api, SUPPORT, "/tickets/tck-0905")).json()
    assert (after_pub["status"], after_pub["resolvedAt"]) == ("waiting_customer", None)

    # 4. Closed ticket -> 409; unknown ticket -> 404.
    assert (
        await post(api, SUPPORT, "/tickets/tck-0810/replies", {"body": "Too late", "internal": False})
    ).status_code == 409
    assert (
        await post(api, SUPPORT, "/tickets/tck-none/replies", {"body": "Ghost", "internal": False})
    ).status_code == 404

    # 5. Empty body / extra field / non-boolean internal -> 400 invalid_request.
    for bad in (
        {"body": "   ", "internal": False},
        {"body": "ok", "internal": False, "extra": 1},
        {"body": "ok", "internal": "yes"},
        {"body": "ok"},
    ):
        res = await post(api, SUPPORT, "/tickets/tck-0915/replies", bad)
        assert res.status_code == 400 and res.json()["error"]["code"] == "invalid_request"

    # 6. Roles without ctl.ticket.reply -> 403 (implementation and partner have read only).
    for caller in (IMPL, PARTNER, SALES):
        assert (
            await post(api, caller, "/tickets/tck-0915/replies", {"body": "nope", "internal": True})
        ).status_code == 403


def test_app_role_cannot_delete_or_write_restricted_support_tables(control_db: tuple[str, str]) -> None:
    _, app_url = control_db
    engine = create_engine(app_url)
    with engine.connect() as conn:
        for stmt in (
            "DELETE FROM ticket_replies",
            "DELETE FROM tickets",
            "DELETE FROM sla_policies",
            "DELETE FROM kb_articles",
            "UPDATE tickets SET subject = 'hacked'",
            "INSERT INTO tickets (id) VALUES ('tck-x')",
            "UPDATE ticket_replies SET body = 'hacked'",
            "INSERT INTO sla_policies (sla_tier) VALUES ('x')",
            "UPDATE sla_policies SET twenty_four_seven = true",
            "INSERT INTO kb_articles (id) VALUES ('kb-x')",
            "UPDATE kb_articles SET title = 'hacked'",
        ):
            with pytest.raises(ProgrammingError):
                conn.execute(text(stmt))
            conn.rollback()
    engine.dispose()
