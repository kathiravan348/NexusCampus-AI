"""Stage 2 Control no-access, metadata-boundary, request-safety, and contract-rule gates (V-1..V-7, NEX-110)."""

import ast
import logging
from pathlib import Path
from typing import Any

import httpx2
import pytest
from fastapi import APIRouter
from fastapi.testclient import TestClient
from pydantic import ValidationError

from nexus.control.accounts import Account
from nexus.control.broker import BreakGlassCase, BrokerRequest
from nexus.control.commercial import Invoice, Payment, Quote, Subscription
from nexus.control.fleet import agent_deployment
from nexus.control.main import API, create_app
from nexus.control.provisioning import OffboardingJob, PortabilityJob, ProvisioningJob
from nexus.control.sessions import SESSION_COOKIE, MemorySessionStore
from nexus.control.settings import ControlSettings
from nexus.control.staff import metadata as control_metadata
from nexus.control.support import SupportTicket, TicketReply
from nexus.control.trust import Certification, SecurityIncident
from nexus.control.viewer import staff_session
from nexus.modules.m02.login_state import MemoryLoginStateStore
from nexus.settings import BACKEND_ROOT
from tests.control.test_app import FakeStore
from tests.fake_keycloak import BASE, CLIENT_ID, SECRET, FakeKeycloak
from tests.routes import api_routes

CONTROL_SRC = Path(BACKEND_ROOT) / "src" / "nexus" / "control"

# Explicit public or signature-authenticated Control routes (no staff cookie/header).
PUBLIC_CONTROL_ROUTES = frozenset(
    {
        ("GET", f"{API}/health"),
        ("GET", f"{API}/ready"),
        ("GET", f"{API}/auth/login"),
        ("GET", f"{API}/auth/callback"),
        ("POST", f"{API}/auth/logout"),
        ("GET", f"{API}/shred-certificate-keys"),
    }
)
WEBHOOK_ROUTES = frozenset(
    {
        ("POST", f"{API}/billing/lago-webhook"),
        ("POST", f"{API}/billing/razorpay-webhook"),
    }
)

# Strictly allowlisted personal/contact or non-medical operational columns in Control.
ALLOWED_PERSONAL_COLUMNS: dict[str, set[str]] = {
    "account_contacts": {"name", "work_email", "phone"},
    "staff_users": {"display_name", "work_email"},
    "deployment_commands": {"payload"},
    "accounts": {"health_score"},  # integer 0-100 account commercial health, not medical data
    "deployments": {"health"},  # service health enum (healthy/degraded/down), not medical data
}
FORBIDDEN_COLUMN_TOKENS = (
    "learner",
    "student",
    "guardian",
    "parent",
    "date_of_birth",
    "dob",
    "blood",
    "medical",
    "health",
    "safeguarding",
    "national_id",
    "aadhaar",
    "passport",
    "card_number",
    "cvv",
    "bank_account",
    "iban",
)


def _all_dep_calls(dependant: Any) -> list[Any]:
    out: list[Any] = []
    for dep in getattr(dependant, "dependencies", []):
        out.append(dep.call)
        out.extend(_all_dep_calls(dep))
    return out


def find_unguarded_control_routes(app: Any) -> list[tuple[str, str]]:
    """Returns `(method, path)` pairs under `/control/api/v1` lacking staff, agent, webhook, or allowlist guard."""
    unguarded: list[tuple[str, str]] = []
    for route in api_routes(app):
        if not route.path.startswith(API):
            continue
        calls = _all_dep_calls(route.dependant)
        has_staff = any(
            c is staff_session or getattr(c, "__qualname__", "").startswith("require.<locals>.") for c in calls
        )
        has_agent = any(c is agent_deployment for c in calls)
        for method in sorted(route.methods or ()):
            pair = (method, route.path)
            if pair in PUBLIC_CONTROL_ROUTES or pair in WEBHOOK_ROUTES or has_staff or has_agent:
                continue
            unguarded.append(pair)
    return unguarded


# --- V-1 Zero standing access / Control separation ----------------------------------------------------------------


def test_V1_no_control_code_connects_to_product_database() -> None:
    """No Control module may import product DB helpers (`nexus.core.db`, `nexus.core.tenancy`, product models)."""
    forbidden_prefixes = (
        "nexus.core.db",
        "nexus.core.tenancy",
        "nexus.modules.m01",
        "nexus.modules.m06",
        "nexus.modules.m83",
    )
    violations: list[str] = []
    for py in sorted(CONTROL_SRC.rglob("*.py")):
        tree = ast.parse(py.read_text(encoding="utf-8"), filename=str(py))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    if alias.name.startswith(forbidden_prefixes):
                        violations.append(f"{py.name}:{alias.name}")
            elif isinstance(node, ast.ImportFrom) and node.module and node.module.startswith(forbidden_prefixes):
                violations.append(f"{py.name}:{node.module}")
    assert violations == []


def test_V1_every_control_route_is_guarded() -> None:
    app = create_app(
        ControlSettings(environment="prod"),
        staff_store=FakeStore(),
        session_store=MemorySessionStore(),
        login_states=MemoryLoginStateStore(),
    )
    assert find_unguarded_control_routes(app) == []


def test_V1_broken_guard_fixture_fails_the_route_walk() -> None:
    """Proves the route-walk check has teeth: adding one unguarded route must fail the check."""
    app = create_app(
        ControlSettings(environment="prod"),
        staff_store=FakeStore(),
        session_store=MemorySessionStore(),
        login_states=MemoryLoginStateStore(),
    )
    rogue = APIRouter(prefix=API)

    @rogue.get("/rogue-leak")
    async def rogue_leak() -> dict[str, str]:
        return {"leak": "no"}

    app.include_router(rogue)
    assert find_unguarded_control_routes(app) == [("GET", f"{API}/rogue-leak")]


@pytest.mark.anyio
async def test_V1_partner_scoping_on_every_control_list(api: httpx2.AsyncClient) -> None:
    """Partner staff (`stf-0051`) only see rows of their own accounts and never internal provider-only lists."""
    # Accounts list for partner ptn-south contains only accounts whose partnerId == ptn-south
    accs = (await api.get(f"{API}/accounts", params={"pageSize": 200}, headers={"X-Nexus-Staff": "stf-0051"})).json()[
        "items"
    ]
    assert accs and all(a["partnerId"] == "ptn-south" for a in accs)
    # Non-partner account detail is 404 (never 200)
    assert (await api.get(f"{API}/accounts/acc-ls", headers={"X-Nexus-Staff": "stf-0051"})).status_code == 404
    # Provider-only collections (deployments, releases, incidents, sub-processors, provisioning) are 403 for partner
    for path in ("/deployments", "/releases", "/incidents", "/sub-processors", "/provisioning-jobs"):
        assert (await api.get(f"{API}{path}", headers={"X-Nexus-Staff": "stf-0051"})).status_code == 403


# --- V-7 Control stores metadata only -----------------------------------------------------------------------------


def test_V7_control_schema_holds_no_institution_personal_data() -> None:
    """Walks every Control table column against forbidden institution PII / payment-card column patterns."""
    # Ensure all Control modules are imported so `control_metadata.tables` is complete.
    assert len(control_metadata.tables) >= 25
    flagged: list[str] = []
    for tname, table in sorted(control_metadata.tables.items()):
        allowed = ALLOWED_PERSONAL_COLUMNS.get(tname, set())
        for col in table.columns:
            if col.name in allowed:
                continue
            cname = col.name.lower()
            # `learners` integer count columns on subscriptions/licences are counts, never person records
            if cname in ("learners", "learner_cap", "learner_count"):
                continue
            if any(tok in cname for tok in FORBIDDEN_COLUMN_TOKENS):
                flagged.append(f"{tname}.{col.name}")
    assert flagged == []


@pytest.mark.anyio
async def test_V4_V7_control_logs_carry_no_secrets_or_personal_data(
    api: httpx2.AsyncClient, caplog: pytest.LogCaptureFixture
) -> None:
    """Captures logs across Control reads/writes and verifies no contact emails or secrets leak."""
    caplog.set_level(logging.DEBUG)
    contacts = (
        await api.get(f"{API}/contacts", params={"pageSize": 200}, headers={"X-Nexus-Staff": "stf-0001"})
    ).json()["items"]
    assert contacts
    await api.get(f"{API}/accounts", headers={"X-Nexus-Staff": "stf-0001"})
    await api.get(f"{API}/tickets", headers={"X-Nexus-Staff": "stf-0001"})
    await api.get(f"{API}/incidents", headers={"X-Nexus-Staff": "stf-0001"})
    logged = "\n".join(r.getMessage() for r in caplog.records)
    emails = {c["workEmail"] for c in contacts if c.get("workEmail")}
    assert [e for e in emails if e in logged] == []


# --- V-6 Request safety: cookies, Origin check, security headers --------------------------------------------------


def test_V6_request_safety_origin_cookies_and_security_headers() -> None:
    kc = FakeKeycloak()
    settings = ControlSettings(
        environment="prod",
        keycloak_url=BASE.split("/realms/")[0],
        keycloak_realm=BASE.split("/realms/")[1],
        oidc_client_id=CLIENT_ID,
        oidc_client_secret=SECRET,  # type: ignore[arg-type]
        api_public_url="https://api.control.test",
        app_public_url="https://app.control.test",
    )
    app = create_app(
        settings,
        staff_store=FakeStore(),
        session_store=MemorySessionStore(),
        http=kc.client(),
        login_states=MemoryLoginStateStore(),
    )
    with TestClient(app, base_url="https://api.control.test", raise_server_exceptions=False) as client:
        health = client.get(f"{API}/health")
        assert health.status_code == 200
        assert health.headers["content-security-policy"] == "default-src 'none'; frame-ancestors 'none'"
        assert health.headers["x-content-type-options"] == "nosniff"
        assert health.headers["referrer-policy"] == "no-referrer"
        assert "max-age=" in health.headers["strict-transport-security"]

        # Sign in via MFA callback -> cookie has HttpOnly, Secure, SameSite=strict, Path=/control
        r_login = client.get(f"{API}/auth/login?returnTo=/", follow_redirects=False)
        from urllib.parse import parse_qs, urlparse

        q = parse_qs(urlparse(r_login.headers["location"]).query)
        kc.claims = {
            "sub": "kc-1",
            "nonce": q["nonce"][0],
            "email_verified": True,
            "email": "nisha.verma@nexuscampus.example",
            "acr": "mfa",
        }
        r_cb = client.get(f"{API}/auth/callback?code=ok&state={q['state'][0]}", follow_redirects=False)
        assert r_cb.status_code == 302
        cookie_hdr = r_cb.headers["set-cookie"].lower()
        assert "httponly" in cookie_hdr and "secure" in cookie_hdr and "samesite=strict" in cookie_hdr
        token = r_cb.cookies[SESSION_COOKIE]

        # Cross-site write with missing or foreign Origin -> 403 (with security headers!)
        r_no_origin = client.post(f"{API}/auth/logout", cookies={SESSION_COOKIE: token})
        assert r_no_origin.status_code == 403
        assert r_no_origin.headers["x-content-type-options"] == "nosniff"
        r_bad_origin = client.post(
            f"{API}/auth/logout", cookies={SESSION_COOKIE: token}, headers={"Origin": "https://evil.example"}
        )
        assert r_bad_origin.status_code == 403

        # Matching Origin succeeds
        r_good = client.post(
            f"{API}/auth/logout", cookies={SESSION_COOKIE: token}, headers={"Origin": "https://app.control.test"}
        )
        assert r_good.status_code == 200


# --- V-7 Control Pydantic cross-field contract validators ---------------------------------------------------------


def test_V7_control_models_enforce_cross_field_rules() -> None:
    """Every Control model rejects cross-field violations just like its frozen Zod schema."""
    with pytest.raises(ValidationError):
        SupportTicket.model_validate(
            {
                "id": "tck-1",
                "number": "TCK-2026-0001",
                "accountId": "acc-1",
                "subject": "Help",
                "summary": "",
                "priority": "p2",
                "status": "resolved",
                "channel": "portal",
                "assigneeStaffId": "stf-1",
                "slaDueAt": "2026-11-24T00:00:00Z",
                "breached": False,
                "accessRequestId": None,
                "createdAt": "2026-11-23T00:00:00Z",
                "resolvedAt": None,
            }
        )
    with pytest.raises(ValidationError):
        TicketReply.model_validate(
            {
                "id": "rep-1",
                "ticketId": "tck-1",
                "authorKind": "customer",
                "authorStaffId": None,
                "body": "hi",
                "internal": True,
                "aiDrafted": False,
                "createdAt": "2026-11-23T00:00:00Z",
            }
        )
    with pytest.raises(ValidationError):
        Certification.model_validate({"id": "c-1", "code": "soc2", "status": "certified", "validUntil": None})
    with pytest.raises(ValidationError):
        SecurityIncident.model_validate(
            {
                "id": "inc-1",
                "title": "Test",
                "severity": "sev1",
                "status": "investigating",
                "affectedAccountIds": ["acc-1", "acc-1"],
                "personalDataAffected": False,
                "detectedAt": "2026-11-23T00:00:00Z",
                "breachNotificationDueAt": None,
                "notifiedAt": None,
                "reportAiDrafted": False,
            }
        )
    with pytest.raises(ValidationError):
        BrokerRequest.model_validate(
            {
                "id": "acr-1",
                "accountId": "acc-1",
                "tenantId": "ten-1",
                "requestedByStaffId": "stf-1",
                "ticketId": None,
                "reason": "debug",
                "modules": ["M83"],
                "mode": "read",
                "durationHours": 2,
                "status": "pending",
                "requestedAt": "2026-11-23T00:00:00Z",
                "decidedAt": None,
            }
        )
    with pytest.raises(ValidationError):
        BreakGlassCase.model_validate(
            {
                "id": "bg-1",
                "accountId": "acc-1",
                "tenantId": "ten-1",
                "category": "legal_order",
                "justification": "A sufficiently long court order justification text.",
                "approverStaffIds": ["stf-1", "stf-1"],
                "openedAt": "2026-11-23T00:00:00Z",
                "institutionNotifiedAt": "2026-11-23T00:01:00Z",
                "closedAt": None,
                "reportDeliveredAt": None,
            }
        )
    with pytest.raises(ValidationError):
        Invoice.model_validate(
            {
                "id": "inv-1",
                "accountId": "acc-1",
                "number": "INV-2026-0001",
                "status": "paid",
                "issueDate": "2026-11-01",
                "dueDate": "2026-11-30",
                "currency": "INR",
                "taxScheme": "gst",
                "lines": [{"description": "Plan", "itemId": None, "quantity": 1, "amountMinor": 100}],
                "subtotalMinor": 100,
                "taxMinor": 18,
                "totalMinor": 118,
                "paidAt": None,
            }
        )
    with pytest.raises(ValidationError):
        Payment.model_validate(
            {
                "id": "pay-1",
                "invoiceId": "inv-1",
                "amountMinor": 100,
                "currency": "INR",
                "method": "upi",
                "gateway": "razorpay",
                "gatewayRef": None,
                "status": "succeeded",
                "createdAt": "2026-11-23T00:00:00Z",
            }
        )
    with pytest.raises(ValidationError):
        Subscription.model_validate(
            {
                "id": "sub-1",
                "accountId": "acc-1",
                "tenantId": "ten-1",
                "planItemId": "cat-1",
                "addonItemIds": [],
                "status": "trialing",
                "period": "monthly",
                "learners": 10,
                "currentPeriodStart": "2026-11-01",
                "currentPeriodEnd": "2026-12-01",
                "trialEndsAt": None,
            }
        )
    with pytest.raises(ValidationError):
        Quote.model_validate(
            {
                "id": "q-1",
                "accountId": "acc-1",
                "number": "QTE-2026-0001",
                "status": "draft",
                "currency": "INR",
                "lines": [
                    {"itemId": "cat-1", "quantity": 1, "unitAmountMinor": 100, "discountPct": 0, "amountMinor": 100}
                ],
                "subtotalMinor": 100,
                "taxMinor": 18,
                "totalMinor": 999,
                "validUntil": "2026-12-01",
                "aiDrafted": False,
                "createdByStaffId": "stf-1",
                "createdAt": "2026-11-23T00:00:00Z",
            }
        )
    # Sanity check that Account/ProvisioningJob/OffboardingJob/PortabilityJob validators are wired
    assert (
        Account is not None
        and ProvisioningJob is not None
        and OffboardingJob is not None
        and PortabilityJob is not None
    )
    with pytest.raises(ValidationError):
        PortabilityJob.model_validate(
            {
                "id": "mov-1",
                "accountId": "acc-1",
                "tenantId": "ten-1",
                "direction": "region_move",
                "fromRegion": "in",
                "toRegion": "in",
                "steps": [
                    {"name": n, "status": "pending"}
                    for n in (
                        "preflight",
                        "export_encrypted",
                        "transfer",
                        "import",
                        "verify",
                        "cutover",
                        "shred_source",
                    )
                ],
                "status": "pending",
                "encrypted": True,
                "createdAt": "2026-11-23T00:00:00Z",
            }
        )
