"""`uv run --project backend nexus-keycloak-staff-dev [--recreate]`: the provider staff realm `nexus-staff` in the dev
Keycloak (NEX-097). Dev only.

Creates the realm from `backend/keycloak/realm-staff.json` when missing (`--recreate` deletes and recreates it, which
also removes every staff user and their one-time-code setup). The client secret comes from
`NEXUS_CONTROL_OIDC_CLIENT_SECRET`. Then each active demo staff member (from the control fixtures) becomes a user
(username = work email, verified) with the dev password `NEXUS_DEMO_USER_PASSWORD`; the one-time-code setup is a
required action, so the first sign-in enrols it and every sign-in after that asks for a code.
"""

import asyncio
import json
import sys
from pathlib import Path

import httpx2

from nexus.control.seed import load_fixtures
from nexus.control.settings import get_control_settings
from nexus.core.timing import utf8_console
from nexus.devtools.keycloak import _admin_token
from nexus.settings import BACKEND_ROOT, get_settings

REALM_FILE = Path(BACKEND_ROOT) / "keycloak" / "realm-staff.json"


def realm_document(client_secret: str) -> dict[str, object]:
    raw = REALM_FILE.read_text(encoding="utf-8").replace("${NEXUS_CONTROL_OIDC_CLIENT_SECRET}", client_secret)
    doc: dict[str, object] = json.loads(raw)
    return doc


async def run(recreate: bool) -> None:
    product = get_settings()
    control = get_control_settings()
    secret = control.oidc_client_secret.get_secret_value()
    password = product.demo_user_password.get_secret_value()
    if not secret or not password:
        sys.exit("Set NEXUS_CONTROL_OIDC_CLIENT_SECRET and NEXUS_DEMO_USER_PASSWORD in backend/.env first.")
    base = control.keycloak_url.rstrip("/")
    realm = control.keycloak_realm
    async with httpx2.AsyncClient(timeout=20) as http:
        token = await _admin_token(http, product)
        http.headers["Authorization"] = f"Bearer {token}"
        admin = f"{base}/admin/realms"
        exists = (await http.get(f"{admin}/{realm}")).status_code == 200
        if exists and recreate:
            (await http.delete(f"{admin}/{realm}")).raise_for_status()
            exists = False
        if not exists:
            res = await http.post(admin, json=realm_document(secret))
            if res.status_code >= 300:
                sys.exit(f"realm import failed: {res.status_code} {res.text[:500]}")
            print(f"realm {realm}: created")
        else:
            print(f"realm {realm}: exists (use --recreate to rebuild it)")

        users = f"{admin}/{realm}/users"
        created = 0
        for s in load_fixtures().staff:
            if not s.active:
                continue
            found = (await http.get(users, params={"email": s.work_email, "exact": "true"})).json()
            if found:
                continue
            first, _, last = s.display_name.partition(" ")
            res = await http.post(
                users,
                json={
                    "username": s.work_email,
                    "email": s.work_email,
                    "emailVerified": True,
                    "enabled": True,
                    "firstName": first,
                    "lastName": last or first,
                    "requiredActions": ["CONFIGURE_TOTP"],
                    "credentials": [{"type": "password", "value": password, "temporary": False}],
                },
            )
            if res.status_code >= 300:
                sys.exit(f"user {s.work_email}: {res.status_code} {res.text[:300]}")
            created += 1
        print(f"staff users: {created} created")


def main() -> None:
    utf8_console()
    asyncio.run(run(recreate="--recreate" in sys.argv[1:]))


if __name__ == "__main__":
    main()
