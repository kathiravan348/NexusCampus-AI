"""Keycloak admin client (D44) for user and organization lifecycle: ensure_organization, invite, enable/disable.

Authenticates as the `nexus-backend` service account (client credentials); its secret comes only from settings
(`.env` / Vault). Tests replace it with `FakeKeycloakAdmin`.
"""

from typing import Any, Protocol

import httpx2

from nexus.core.errors import ApiError
from nexus.settings import Settings


class KeycloakAdmin(Protocol):
    async def ensure_organization(self, *, tenant_id: str, name: str, domain: str) -> str: ...

    async def invite(self, *, tenant_id: str, email: str, legal_name: str) -> str: ...

    async def set_enabled(self, *, email: str, enabled: bool) -> None: ...

    async def upsert_identity_provider(self, *, tenant_id: str, provider: dict[str, Any]) -> None: ...


class HttpKeycloakAdmin:
    def __init__(self, settings: Settings, http: httpx2.AsyncClient) -> None:
        self._s = settings
        self._http = http

    @property
    def _admin(self) -> str:
        return f"{self._s.keycloak_url.rstrip('/')}/admin/realms/{self._s.keycloak_realm}"

    async def _headers(self) -> dict[str, str]:
        base = f"{self._s.keycloak_url.rstrip('/')}/realms/{self._s.keycloak_realm}"
        token_url = f"{base}/protocol/openid-connect/token"
        res = await self._http.post(
            token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": self._s.oidc_client_id,
                "client_secret": self._s.oidc_client_secret.get_secret_value(),
            },
        )
        if res.status_code != 200:
            raise ApiError(503, "internal", "The sign-in service is not reachable.")
        return {"Authorization": f"Bearer {res.json()['access_token']}"}

    async def _user_id(self, headers: dict[str, str], email: str) -> str | None:
        res = await self._http.get(f"{self._admin}/users", params={"username": email, "exact": "true"}, headers=headers)
        found = res.json() if res.status_code == 200 else []
        return str(found[0]["id"]) if found else None

    async def _org_id(self, headers: dict[str, str], tenant_id: str) -> str | None:
        orgs = await self._http.get(f"{self._admin}/organizations", params={"max": 500}, headers=headers)
        if orgs.status_code != 200:
            return None
        org = next((o for o in orgs.json() if o.get("alias") == tenant_id), None)
        return str(org["id"]) if org is not None else None

    async def ensure_organization(self, *, tenant_id: str, name: str, domain: str) -> str:
        """Creates the tenant's Keycloak organization if missing (idempotent by `alias = tenant_id`)."""
        try:
            headers = await self._headers()
            existing = await self._org_id(headers, tenant_id)
            if existing is not None:
                return existing
            res = await self._http.post(
                f"{self._admin}/organizations",
                headers=headers,
                json={
                    "name": name,
                    "alias": tenant_id,
                    "enabled": True,
                    "domains": [{"name": domain, "verified": True}],
                },
            )
            if res.status_code not in (201, 409):
                raise ApiError(503, "internal", "The sign-in service could not create the organization.")
            created = await self._org_id(headers, tenant_id)
            if created is None:
                raise ApiError(503, "internal", "The sign-in service could not locate the organization.")
            return created
        except httpx2.HTTPError as exc:
            raise ApiError(503, "internal", "The sign-in service is not reachable.") from exc

    async def invite(self, *, tenant_id: str, email: str, legal_name: str) -> str:
        try:
            headers = await self._headers()
            first, _, last = legal_name.partition(" ")
            res = await self._http.post(
                f"{self._admin}/users",
                headers=headers,
                json={
                    "username": email,
                    "email": email,
                    "enabled": True,
                    "emailVerified": False,
                    "firstName": first,
                    "lastName": last,
                    "requiredActions": ["VERIFY_EMAIL", "UPDATE_PASSWORD"],
                },
            )
            if res.status_code not in (201, 409):
                raise ApiError(503, "internal", "The sign-in service could not create the account.")
            kc_id = await self._user_id(headers, email)
            org_id = await self._org_id(headers, tenant_id)
            if kc_id is None or org_id is None:
                raise ApiError(503, "internal", "The sign-in service could not link the account.")
            member = await self._http.post(f"{self._admin}/organizations/{org_id}/members", headers=headers, json=kc_id)
            if member.status_code not in (201, 204, 409):
                raise ApiError(503, "internal", "The sign-in service could not link the account.")
            return kc_id
        except httpx2.HTTPError as exc:
            raise ApiError(503, "internal", "The sign-in service is not reachable.") from exc

    async def set_enabled(self, *, email: str, enabled: bool) -> None:
        try:
            headers = await self._headers()
            kc_id = await self._user_id(headers, email)
            if kc_id is None:
                return
            res = await self._http.put(f"{self._admin}/users/{kc_id}", headers=headers, json={"enabled": enabled})
            if res.status_code not in (200, 204):
                raise ApiError(503, "internal", "The sign-in service could not update the account.")
        except httpx2.HTTPError as exc:
            raise ApiError(503, "internal", "The sign-in service is not reachable.") from exc

    async def upsert_identity_provider(self, *, tenant_id: str, provider: dict[str, Any]) -> None:
        """Identity provider `<tenant>-<provider id>`, linked to the tenant's organization by email domain."""
        alias = f"{tenant_id}-{provider['id']}"
        config: dict[str, str] = {
            "clientId": provider["clientId"],
            "kc.org.domain": provider["domains"][0],
            "kc.org.broker.redirect.mode.email-matches": "true",
        }
        if provider["protocol"] == "oidc":
            config["issuer"] = provider["issuerUrl"]
        else:
            config["idpEntityId"] = provider["issuerUrl"]
        payload = {
            "alias": alias,
            "displayName": provider["name"],
            "enabled": False,
            "config": config,
            "providerId": "oidc" if provider["protocol"] == "oidc" else "saml",
        }
        try:
            headers = await self._headers()
            res = await self._http.post(f"{self._admin}/identity-provider/instances", headers=headers, json=payload)
            if res.status_code == 409:
                res = await self._http.put(
                    f"{self._admin}/identity-provider/instances/{alias}", headers=headers, json=payload
                )
            if res.status_code not in (200, 201, 204):
                raise ApiError(503, "internal", "The sign-in service could not save the provider.")
            org_id = await self._org_id(headers, tenant_id)
            if org_id is not None:
                await self._http.post(
                    f"{self._admin}/organizations/{org_id}/identity-providers", headers=headers, json=alias
                )
        except httpx2.HTTPError as exc:
            raise ApiError(503, "internal", "The sign-in service is not reachable.") from exc


class FakeKeycloakAdmin:
    """In-memory stand-in for tests: records calls; `fail = True` simulates an outage."""

    def __init__(self) -> None:
        self.organizations: dict[str, dict[str, Any]] = {}
        self.invited: list[tuple[str, str]] = []
        self.enabled: dict[str, bool] = {}
        self.providers: dict[str, dict[str, Any]] = {}
        self.fail = False

    async def ensure_organization(self, *, tenant_id: str, name: str, domain: str) -> str:
        if self.fail:
            raise ApiError(503, "internal", "The sign-in service is not reachable.")
        self.organizations.setdefault(tenant_id, {"name": name, "domain": domain})
        return f"org-{tenant_id}"

    async def invite(self, *, tenant_id: str, email: str, legal_name: str) -> str:
        if self.fail:
            raise ApiError(503, "internal", "The sign-in service is not reachable.")
        self.invited.append((tenant_id, email))
        return f"kc-{email}"

    async def set_enabled(self, *, email: str, enabled: bool) -> None:
        if self.fail:
            raise ApiError(503, "internal", "The sign-in service is not reachable.")
        self.enabled[email] = enabled

    async def upsert_identity_provider(self, *, tenant_id: str, provider: dict[str, Any]) -> None:
        if self.fail:
            raise ApiError(503, "internal", "The sign-in service is not reachable.")
        self.providers[f"{tenant_id}-{provider['id']}"] = provider
