"""OIDC client for the cell's Keycloak realm (D44): authorization code + PKCE, ID-token verification.

Discovery and JWKS are fetched once and cached; an unknown signing key triggers one JWKS refresh (rotation).
"""

import base64
import hashlib
import secrets
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx2
import jwt

from nexus.core.errors import ApiError
from nexus.settings import Settings

SCOPES = "openid email profile organization"
ALGORITHMS = ["RS256"]


def pkce_pair() -> tuple[str, str]:
    """(code_verifier, S256 code_challenge)."""
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return verifier, base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


@dataclass(frozen=True)
class Discovery:
    issuer: str
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str
    end_session_endpoint: str | None


class OidcClient:
    def __init__(self, settings: Settings, http: httpx2.AsyncClient) -> None:
        self._settings = settings
        self._http = http
        self._discovery: Discovery | None = None
        self._jwks: jwt.PyJWKSet | None = None

    @property
    def redirect_uri(self) -> str:
        return f"{self._settings.api_public_url.rstrip('/')}/api/v1/auth/callback"

    async def discovery(self) -> Discovery:
        if self._discovery is None:
            base = f"{self._settings.keycloak_url.rstrip('/')}/realms/{self._settings.keycloak_realm}"
            doc = await self._get_json(f"{base}/.well-known/openid-configuration")
            self._discovery = Discovery(
                issuer=doc["issuer"],
                authorization_endpoint=doc["authorization_endpoint"],
                token_endpoint=doc["token_endpoint"],
                jwks_uri=doc["jwks_uri"],
                end_session_endpoint=doc.get("end_session_endpoint"),
            )
        return self._discovery

    async def authorize_url(self, *, state: str, nonce: str, code_challenge: str) -> str:
        d = await self.discovery()
        query = {
            "client_id": self._settings.oidc_client_id,
            "response_type": "code",
            "scope": SCOPES,
            "redirect_uri": self.redirect_uri,
            "state": state,
            "nonce": nonce,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return f"{d.authorization_endpoint}?{urlencode(query)}"

    async def exchange_code(self, *, code: str, code_verifier: str) -> dict[str, Any]:
        d = await self.discovery()
        try:
            res = await self._http.post(
                d.token_endpoint,
                data={
                    "grant_type": "authorization_code",
                    "code": code,
                    "redirect_uri": self.redirect_uri,
                    "code_verifier": code_verifier,
                    "client_id": self._settings.oidc_client_id,
                    "client_secret": self._settings.oidc_client_secret.get_secret_value(),
                },
            )
        except httpx2.HTTPError as exc:
            raise ApiError(503, "internal", "Sign-in service is not reachable.") from exc
        if res.status_code != 200:
            raise ApiError(401, "unauthorized", "Sign-in was not completed.")
        body: dict[str, Any] = res.json()
        return body

    async def verify_id_token(self, id_token: str, *, nonce: str) -> dict[str, Any]:
        d = await self.discovery()
        try:
            key = await self._signing_key(id_token)
            claims: dict[str, Any] = jwt.decode(
                id_token,
                key=key,
                algorithms=ALGORITHMS,
                audience=self._settings.oidc_client_id,
                issuer=d.issuer,
                options={"require": ["exp", "iat", "iss", "aud", "sub", "nonce"]},
                leeway=30,
            )
        except jwt.PyJWTError as exc:
            raise ApiError(401, "unauthorized", "Sign-in token is not valid.") from exc
        if not secrets.compare_digest(str(claims.get("nonce", "")), nonce):
            raise ApiError(401, "unauthorized", "Sign-in token is not valid.")
        return claims

    async def end_session_url(self, *, id_token_hint: str | None = None) -> str | None:
        d = await self.discovery()
        if d.end_session_endpoint is None:
            return None
        query = {
            "client_id": self._settings.oidc_client_id,
            "post_logout_redirect_uri": self._settings.app_public_url.rstrip("/") + "/",
        }
        if id_token_hint:
            query["id_token_hint"] = id_token_hint
        return f"{d.end_session_endpoint}?{urlencode(query)}"

    async def _signing_key(self, token: str) -> Any:
        kid = jwt.get_unverified_header(token).get("kid")
        for attempt in range(2):
            if self._jwks is None or attempt == 1:
                d = await self.discovery()
                self._jwks = jwt.PyJWKSet.from_dict(await self._get_json(d.jwks_uri))
            for k in self._jwks.keys:
                if k.key_id == kid:
                    return k.key
        raise jwt.InvalidKeyError("unknown signing key")

    async def _get_json(self, url: str) -> dict[str, Any]:
        try:
            res = await self._http.get(url)
            res.raise_for_status()
        except httpx2.HTTPError as exc:
            raise ApiError(503, "internal", "Sign-in service is not reachable.") from exc
        body: dict[str, Any] = res.json()
        return body
