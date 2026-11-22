from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from nexus.control.main import create_app
from nexus.control.seed import load_fixtures
from nexus.control.sessions import MemorySessionStore
from nexus.control.settings import ControlSettings
from nexus.control.staff import StaffSession, StaffUser
from nexus.modules.m02.login_state import MemoryLoginStateStore

API = "/control/api/v1"


class FakeStore:
    """Staff from the exported fixtures, role permissions joined like the database does."""

    def __init__(self) -> None:
        data = load_fixtures()
        self.staff = {s.id: s for s in data.staff}
        self.perms = data.role_permissions

    async def session_of(self, staff_id: str, minutes: int) -> StaffSession | None:
        s: StaffUser | None = self.staff.get(staff_id)
        if s is None or not s.active or not s.mfa_enrolled:
            return None
        perms = sorted({p for r in s.roles for p in self.perms.get(r, [])})
        return StaffSession(staff=s, permissions=perms, expires_at="2026-11-22T13:00:00Z")

    async def id_by_email(self, email: str) -> str | None:
        return next((s.id for s in self.staff.values() if s.work_email.lower() == email.lower()), None)

    async def record_sign_in(self, staff_id: str) -> None:
        self.signed_in = staff_id

    async def accounts_of_partner(self, partner_id: str) -> list[str]:
        return [str(a["id"]) for a in load_fixtures().accounts if a["partnerId"] == partner_id]


def client(environment: str) -> Iterator[TestClient]:
    app = create_app(
        ControlSettings(environment=environment),  # type: ignore[arg-type]
        staff_store=FakeStore(),
        session_store=MemorySessionStore(),
        login_states=MemoryLoginStateStore(),
    )
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c


@pytest.fixture
def dev() -> Iterator[TestClient]:
    yield from client("dev")


@pytest.fixture
def prod() -> Iterator[TestClient]:
    yield from client("prod")


def test_health(dev: TestClient) -> None:
    assert dev.get(f"{API}/health").json() == {"status": "ok"}


def test_me_with_the_dev_header(dev: TestClient) -> None:
    res = dev.get(f"{API}/me", headers={"X-Nexus-Staff": "stf-0001"})
    assert res.status_code == 200
    body = res.json()
    assert body["staff"]["displayName"] == "Nisha Verma"
    assert body["mfaVerified"] is True
    assert "ctl.account.read" in body["permissions"]
    assert body["permissions"] == sorted(body["permissions"])


def test_me_refuses_unknown_staff_and_no_header(dev: TestClient) -> None:
    assert dev.get(f"{API}/me", headers={"X-Nexus-Staff": "stf-nobody"}).status_code == 401
    assert dev.get(f"{API}/me").json()["error"]["code"] == "unauthorized"


def test_prod_never_accepts_the_dev_header(prod: TestClient) -> None:
    assert prod.get(f"{API}/me", headers={"X-Nexus-Staff": "stf-0001"}).status_code == 401


def test_fixtures_match_the_contract_rules() -> None:
    data = load_fixtures()
    for s in data.staff:
        assert ("partner" in s.roles) == (s.partner_id is not None)
    # No permission names institution data (V-1, V-7): Control permissions are all `ctl.*`.
    assert all(p.startswith("ctl.") for perms in data.role_permissions.values() for p in perms)
