"""P05 API (NEX-103): licence list as the mocks; files really signed (Ed25519) and verifiable offline; renew."""

from datetime import date
from typing import Any

import httpx2
import pytest
from sqlalchemy import create_engine, text

from nexus.control.seed import load_fixtures
from nexus.core.vault import FakeVault
from nexus.licensing.licence import LicenceFile, fingerprint, key_id, verify_licence

API = "/control/api/v1"
IMPLEMENTATION, SUPPORT, PARTNER = "stf-0023", "stf-0042", "stf-0051"
FIX = load_fixtures()


async def call(api: httpx2.AsyncClient, staff: str, method: str, path: str) -> httpx2.Response:
    return await api.request(method, f"{API}{path}", headers={"X-Nexus-Staff": staff})


async def public_keys(vault: FakeVault) -> dict[str, bytes]:
    return {key_id("nexus-licence", v): raw for v, raw in (await vault.public_keys("nexus-licence")).items()}


@pytest.mark.anyio
async def test_list_equals_the_fixtures_and_access(api: httpx2.AsyncClient) -> None:
    body = (await api.get(f"{API}/licences", headers={"X-Nexus-Staff": SUPPORT})).json()
    assert {lic["id"]: lic for lic in body["items"]} == {lic["id"]: lic for lic in FIX.licences}
    assert (await call(api, SUPPORT, "GET", "/licence-files/lic-ct-2026")).status_code == 403
    assert (await call(api, SUPPORT, "POST", "/licences/lic-ct-2026/renew")).status_code == 403
    assert (await call(api, PARTNER, "GET", "/licences")).status_code == 403


@pytest.mark.anyio
async def test_downloaded_file_is_really_signed(api: httpx2.AsyncClient, fake_vault: FakeVault) -> None:
    res = await call(api, IMPLEMENTATION, "GET", "/licence-files/lic-ct-2026")
    assert res.status_code == 200
    file = LicenceFile.model_validate(res.json())
    assert file.payload.signing_key_id == "nexus-licence:v1"
    check = verify_licence(file, await public_keys(fake_vault), date(2026, 11, 22))
    assert (check.valid, check.state) == (True, "active")
    row = (await call(api, IMPLEMENTATION, "GET", "/licences/lic-ct-2026")).json()
    assert row["fingerprint"] == fingerprint(file)
    assert row["signingKeyId"] == "nexus-licence:v1"
    again = await call(api, IMPLEMENTATION, "GET", "/licence-files/lic-ct-2026")
    assert again.json() == res.json()  # stored, not re-signed


@pytest.mark.anyio
async def test_renew_re_signs_one_more_year(api: httpx2.AsyncClient, fake_vault: FakeVault) -> None:
    before: dict[str, Any] = (await call(api, IMPLEMENTATION, "GET", "/licences/lic-al-perp")).json()
    res = await call(api, IMPLEMENTATION, "POST", "/licences/lic-al-perp/renew")
    assert res.status_code == 200
    renewed = res.json()
    assert renewed["expiresAt"] is None  # perpetual stays perpetual
    assert renewed["supportEndsAt"] == "2027-12-31"
    assert renewed["state"] == "active" and renewed["fingerprint"] != before["fingerprint"]
    file = LicenceFile.model_validate((await call(api, IMPLEMENTATION, "GET", "/licence-files/lic-al-perp")).json())
    assert file.payload.support_ends_at == "2027-12-31"
    assert fingerprint(file) == renewed["fingerprint"]
    assert verify_licence(file, await public_keys(fake_vault), date(2030, 1, 1)).state == "active"


@pytest.mark.anyio
async def test_revoked_licence_cannot_be_renewed(api: httpx2.AsyncClient, control_db: tuple[str, str]) -> None:
    owner, _ = control_db
    engine = create_engine(owner)
    with engine.begin() as conn:
        conn.execute(text("UPDATE licences SET state = 'revoked' WHERE id = 'lic-ct-2026'"))
    engine.dispose()
    assert (await call(api, IMPLEMENTATION, "POST", "/licences/lic-ct-2026/renew")).status_code == 409
