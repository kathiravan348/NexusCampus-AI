"""P01 API on the control database (NEX-101): same data and shapes as the mocks, permissions, partner scoping."""

from typing import Any

import httpx2
import pytest

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
async def test_lists_equal_the_mock_fixtures_for_our_staff(api: httpx2.AsyncClient) -> None:
    for path, rows in [
        ("/accounts", FIX.accounts),
        ("/contacts", FIX.contacts),
        ("/opportunities", FIX.opportunities),
        ("/contracts", FIX.contracts),
        ("/notes", FIX.notes),
    ]:
        res = await get(api, ADMIN, path, pageSize=200)
        assert res.status_code == 200, path
        body = res.json()
        assert body["total"] == len(rows), path
        assert by_id(body["items"]) == by_id(rows), path
    partners = await get(api, BILLING, "/partners", pageSize=200)
    assert by_id(partners.json()["items"]) == by_id(FIX.partners)


@pytest.mark.anyio
async def test_filters_detail_paging_and_directory(api: httpx2.AsyncClient) -> None:
    customers = (await get(api, ADMIN, "/accounts", stage="customer", pageSize=200)).json()["items"]
    assert customers and all(a["stage"] == "customer" for a in customers)
    one = FIX.accounts[0]
    assert (await get(api, ADMIN, f"/accounts/{one['id']}")).json() == one
    assert (await get(api, ADMIN, "/accounts/acc-none")).status_code == 404
    page = (await get(api, ADMIN, "/accounts", pageSize=2, page=2)).json()
    assert (len(page["items"]), page["total"], page["page"], page["pageSize"]) == (2, len(FIX.accounts), 2, 2)
    notes = (await get(api, ADMIN, "/notes", accountId=one["id"], pageSize=200)).json()["items"]
    assert all(n["accountId"] == one["id"] for n in notes)
    directory = (await get(api, RELEASE, "/staff-directory", pageSize=200)).json()
    assert directory["total"] == len(FIX.staff)


@pytest.mark.anyio
async def test_permissions_deny_by_default(api: httpx2.AsyncClient) -> None:
    assert (await get(api, RELEASE, "/accounts")).status_code == 403
    assert (await get(api, SUPPORT, "/partners")).status_code == 403
    assert (await api.get(f"{API}/accounts")).status_code == 401


@pytest.mark.anyio
async def test_partner_user_sees_only_their_accounts(api: httpx2.AsyncClient) -> None:
    me = (await get(api, PARTNER, "/me")).json()
    partner_id = me["staff"]["partnerId"]
    own = {a["id"] for a in FIX.accounts if a["partnerId"] == partner_id}
    assert own
    accounts = (await get(api, PARTNER, "/accounts", pageSize=200)).json()["items"]
    assert {a["id"] for a in accounts} == own
    contacts = (await get(api, PARTNER, "/contacts", pageSize=200)).json()["items"]
    assert {c["accountId"] for c in contacts} <= own
    other = next(a["id"] for a in FIX.accounts if a["id"] not in own)
    assert (await get(api, PARTNER, f"/accounts/{other}")).status_code == 404


@pytest.mark.anyio
async def test_adding_a_note(api: httpx2.AsyncClient) -> None:
    account = FIX.accounts[1]["id"]
    res = await api.post(
        f"{API}/notes",
        json={"accountId": account, "body": "  Called about renewal.  "},
        headers={"X-Nexus-Staff": SALES},
    )
    assert res.status_code == 201
    note = res.json()
    assert (note["accountId"], note["authorStaffId"], note["body"]) == (account, SALES, "Called about renewal.")
    latest = (await get(api, SALES, "/notes", accountId=account)).json()["items"][0]
    assert latest == note
    denied = await api.post(
        f"{API}/notes", json={"accountId": account, "body": "x"}, headers={"X-Nexus-Staff": BILLING}
    )
    assert denied.status_code == 403
    empty = await api.post(f"{API}/notes", json={"accountId": account, "body": "  "}, headers={"X-Nexus-Staff": SALES})
    assert empty.status_code == 400
