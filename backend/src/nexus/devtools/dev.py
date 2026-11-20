"""`uv run --project backend nexus-dev`: uvicorn with reload on 127.0.0.1; logs `[timing] backend:start`."""

from pathlib import Path

import uvicorn

from nexus.core.timing import mark_boot_start, utf8_console
from nexus.settings import get_settings

BACKEND_ROOT = Path(__file__).resolve().parents[3]


def main() -> None:
    utf8_console()
    mark_boot_start()
    settings = get_settings()
    uvicorn.run(
        "nexus.main:create_app",
        factory=True,
        host=settings.host,
        port=settings.port,
        reload=True,
        reload_dirs=[str(BACKEND_ROOT / "src")],
    )


if __name__ == "__main__":
    main()
