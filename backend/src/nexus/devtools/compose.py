"""`uv run --project backend nexus-compose-up`: starts PostgreSQL + Redis and waits until both are healthy,
then prints `[timing] compose:up …`. Stop with `docker compose -f backend/compose.yaml down`.
"""

import subprocess
import sys
import time

from nexus.core.timing import timing_line, utf8_console
from nexus.devtools.dev import BACKEND_ROOT


def main() -> None:
    utf8_console()
    start = time.perf_counter()
    result = subprocess.run(
        ["docker", "compose", "-f", str(BACKEND_ROOT / "compose.yaml"), "up", "-d", "--wait"],
        cwd=BACKEND_ROOT,
        check=False,
    )
    print(timing_line("compose:up", "compose:up", (time.perf_counter() - start) * 1000), flush=True)
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()
