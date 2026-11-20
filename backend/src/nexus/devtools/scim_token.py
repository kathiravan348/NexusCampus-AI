"""`uv run --project backend nexus-scim-token <tenantId>`: issues a SCIM bearer token for a tenant.

The token is printed once and never stored in clear (only `sha256(secret)`). Give it to the institution's
directory (e.g. Entra ID, Okta, Google) as the SCIM bearer token. Revoke by setting `revoked_at` (an M02
screen comes later).
"""

import secrets
import sys

from sqlalchemy import create_engine, text

from nexus.core.ids import new_id
from nexus.core.tenancy import TENANT_SETTING
from nexus.core.timing import utf8_console
from nexus.modules.m02.scim import hash_secret
from nexus.settings import get_settings


def issue(owner_url: str, tenant_id: str) -> str:
    token_id, secret = new_id("scm"), secrets.token_urlsafe(32)
    engine = create_engine(owner_url)
    try:
        with engine.begin() as conn:
            conn.execute(text("SELECT set_config(:n, :t, true)"), {"n": TENANT_SETTING, "t": tenant_id})
            conn.execute(
                text("INSERT INTO scim_tokens (id, tenant_id, token_hash) VALUES (:id, :t, :h)"),
                {"id": token_id, "t": tenant_id, "h": hash_secret(secret)},
            )
    finally:
        engine.dispose()
    return f"{tenant_id}.{token_id}.{secret}"


def main() -> None:
    utf8_console()
    if len(sys.argv) != 2:
        sys.exit("usage: nexus-scim-token <tenantId>")
    print(issue(get_settings().migrate_database_url.get_secret_value(), sys.argv[1]))


if __name__ == "__main__":
    main()
