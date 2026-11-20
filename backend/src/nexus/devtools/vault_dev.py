"""`uv run --project backend nexus-vault-dev`: creates the dev Vault Transit keys for every seeded key row.

Idempotent (Transit `create` keeps an existing key). Dev only: real installs provision keys when a tenant is created
(Nexus Control, Stage 2) through `nexus.modules.m83.keys.provision_key`.
"""

import asyncio
import sys

import httpx2
from sqlalchemy import create_engine, text

from nexus.core.timing import utf8_console
from nexus.core.vault import HttpVault
from nexus.settings import get_settings


async def setup() -> int:
    s = get_settings()
    if s.environment != "dev" or not s.vault_token.get_secret_value():
        sys.exit("Dev only: set NEXUS_ENVIRONMENT=dev and NEXUS_VAULT_TOKEN in backend/.env")
    engine = create_engine(s.migrate_database_url.get_secret_value())
    with engine.connect() as conn:
        names = list(conn.execute(text("SELECT vault_key_name FROM vault_keys WHERE status <> 'destroyed'")).scalars())
    engine.dispose()
    async with httpx2.AsyncClient(timeout=10.0) as http:
        vault = HttpVault(s, http)
        for name in names:
            await vault.create_key(name)
    return len(names)


def main() -> None:
    utf8_console()
    print(f"vault dev: {asyncio.run(setup())} transit keys ready")


if __name__ == "__main__":
    main()
