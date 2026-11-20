"""`uv run --project backend nexus-keycloak-dev`: puts the demo tenants and users into the dev Keycloak (D44).

Idempotent. Each demo tenant becomes an organization (alias = tenant id, domain = its staff email domain);
each demo user with an email becomes a Keycloak user (username = email, verified) with the password
`NEXUS_DEMO_USER_PASSWORD` from backend/.env, and a member of its tenant's organization. Dev only.

It also links each demo user in the dev database to its Keycloak id (`users.idp_subject`), so sign-in keeps working
after the Keycloak container (and its users) was recreated.
"""

import asyncio
import sys
from collections import Counter
from typing import Any

import httpx2
from sqlalchemy import create_engine, text

from nexus.core.timing import utf8_console
from nexus.seed.demo import load_fixtures
from nexus.settings import Settings, get_settings


async def _admin_token(http: httpx2.AsyncClient, s: Settings) -> str:
    res = await http.post(
        f"{s.keycloak_url}/realms/master/protocol/openid-connect/token",
        data={
            "grant_type": "password",
            "client_id": "admin-cli",
            "username": s.keycloak_admin_user,
            "password": s.keycloak_admin_password.get_secret_value(),
        },
    )
    res.raise_for_status()
    return str(res.json()["access_token"])


def _staff_domain(data: dict[str, Any], tenant_id: str) -> str:
    """Most common email domain of the tenant's users, ignoring the shared family domain."""
    domains = Counter(
        u["email"].split("@")[1]
        for u in data["users"]
        if u["tenantId"] == tenant_id and not u["email"].endswith("@family.test")
    )
    domain: str = domains.most_common(1)[0][0]
    return domain


async def _organizations(http: httpx2.AsyncClient, admin: str, data: dict[str, Any]) -> dict[str, str]:
    existing = (await http.get(f"{admin}/organizations", params={"max": 500})).json()
    by_alias = {o["alias"]: o["id"] for o in existing}
    for tenant in data["tenants"]:
        if tenant["id"] in by_alias:
            continue
        res = await http.post(
            f"{admin}/organizations",
            json={
                "name": tenant["name"],
                "alias": tenant["id"],
                "enabled": True,
                "domains": [{"name": _staff_domain(data, tenant["id"]), "verified": True}],
            },
        )
        res.raise_for_status()
        by_alias[tenant["id"]] = res.headers["location"].rsplit("/", 1)[1]
    return by_alias


async def _user_id(http: httpx2.AsyncClient, admin: str, user: dict[str, Any], person: dict[str, Any]) -> str:
    found = (await http.get(f"{admin}/users", params={"username": user["email"], "exact": "true"})).json()
    if found:
        return str(found[0]["id"])
    name = (person.get("preferredName") or person["legalName"]).split(" ", 1)
    res = await http.post(
        f"{admin}/users",
        json={
            "username": user["email"],
            "email": user["email"],
            "emailVerified": True,
            "enabled": True,
            "firstName": name[0],
            "lastName": name[1] if len(name) > 1 else "",
            "credentials": [
                {
                    "type": "password",
                    "value": get_settings().demo_user_password.get_secret_value(),
                    "temporary": False,
                }
            ],
        },
    )
    res.raise_for_status()
    return res.headers["location"].rsplit("/", 1)[1]


async def setup() -> dict[str, int]:
    s = get_settings()
    if s.environment != "dev" or not s.demo_user_password.get_secret_value():
        sys.exit("Dev only: set NEXUS_ENVIRONMENT=dev and NEXUS_DEMO_USER_PASSWORD in backend/.env")
    data = load_fixtures()
    people = {p["id"]: p for p in data["people"]}
    async with httpx2.AsyncClient(timeout=20.0) as http:
        http.headers["Authorization"] = f"Bearer {await _admin_token(http, s)}"
        admin = f"{s.keycloak_url}/admin/realms/{s.keycloak_realm}"
        orgs = await _organizations(http, admin, data)
        members = 0
        links: dict[str, str] = {}
        for user in data["users"]:
            kc_id = await _user_id(http, admin, user, people[user["personId"]])
            links[user["id"]] = kc_id
            res = await http.post(f"{admin}/organizations/{orgs[user['tenantId']]}/members", json=kc_id)
            if res.status_code not in (201, 204, 409):
                res.raise_for_status()
            members += 1
    link_subjects(s, links)
    return {"organizations": len(orgs), "users": members}


def link_subjects(s: Settings, links: dict[str, str]) -> None:
    """Dev database: point each demo user at its current Keycloak id (owner connection, dev only)."""
    engine = create_engine(s.migrate_database_url.get_secret_value())
    try:
        with engine.begin() as conn:
            for user_id, subject in links.items():
                conn.execute(
                    text("UPDATE users SET idp_subject = NULL WHERE idp_subject = :sub AND id <> :id"),
                    {"sub": subject, "id": user_id},
                )
                conn.execute(
                    text("UPDATE users SET idp_subject = :sub WHERE id = :id"), {"sub": subject, "id": user_id}
                )
    finally:
        engine.dispose()


def main() -> None:
    utf8_console()
    counts = asyncio.run(setup())
    print(f"keycloak dev: {counts['organizations']} organizations, {counts['users']} users")


if __name__ == "__main__":
    main()
