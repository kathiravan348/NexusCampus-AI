"""`uv run --project backend nexus-control-dev`: the Nexus Control backend with reload on 127.0.0.1:8100 (NEX-100).

Needs the control database (`nexus-control-db`), the staff realm (`nexus-keycloak-staff-dev`) and Valkey from the
dev Compose stack. The Control app reaches it through `pnpm --dir frontend dev:control:real`.
"""

import uvicorn

from nexus.core.timing import mark_boot_start, utf8_console
from nexus.devtools.dev import BACKEND_ROOT


def main() -> None:
    utf8_console()
    mark_boot_start()
    uvicorn.run(
        "nexus.control.main:create_app",
        factory=True,
        host="127.0.0.1",
        port=8100,
        reload=True,
        reload_dirs=[str(BACKEND_ROOT / "src")],
    )


if __name__ == "__main__":
    main()
