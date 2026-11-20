"""A fake Keycloak at the HTTP boundary (`httpx2.MockTransport`): discovery, JWKS and the token endpoint.

The token endpoint returns an ID token signed with a test RSA key, carrying the claims the test sets next.
"""

import json
import time
from typing import Any
from urllib.parse import parse_qs

import httpx2
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa

BASE = "http://kc.test/realms/nexus-dev"
CLIENT_ID = "nexus-backend"
SECRET = "test-client-secret"  # noqa: S105 — fake value for the fake server


class FakeKeycloak:
    def __init__(self) -> None:
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.kid = "test-key-1"
        self.claims: dict[str, Any] = {}
        self.token_requests: list[dict[str, list[str]]] = []
        self.token_status = 200

    def id_token(self, **overrides: Any) -> str:
        now = int(time.time())
        claims = {"iss": BASE, "aud": CLIENT_ID, "iat": now, "exp": now + 300, **self.claims, **overrides}
        return jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": self.kid})

    def jwks(self) -> dict[str, Any]:
        public = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
        return {"keys": [{**public, "kid": self.kid, "use": "sig", "alg": "RS256"}]}

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        path = request.url.path
        if path.endswith("/.well-known/openid-configuration"):
            return httpx2.Response(
                200,
                json={
                    "issuer": BASE,
                    "authorization_endpoint": f"{BASE}/protocol/openid-connect/auth",
                    "token_endpoint": f"{BASE}/protocol/openid-connect/token",
                    "jwks_uri": f"{BASE}/protocol/openid-connect/certs",
                    "end_session_endpoint": f"{BASE}/protocol/openid-connect/logout",
                },
            )
        if path.endswith("/certs"):
            return httpx2.Response(200, json=self.jwks())
        if path.endswith("/token"):
            form = parse_qs(request.content.decode())
            self.token_requests.append(form)
            if self.token_status != 200 or form.get("client_secret") != [SECRET]:
                return httpx2.Response(400, json={"error": "invalid_grant"})
            return httpx2.Response(200, json={"id_token": self.id_token(), "access_token": "opaque"})
        return httpx2.Response(404)

    def client(self) -> httpx2.AsyncClient:
        return httpx2.AsyncClient(transport=httpx2.MockTransport(self.handler))
