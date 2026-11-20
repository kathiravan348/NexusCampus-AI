"""`uv run --project backend backend-check`: format, lint, strict types and tests, each timed, then the total
(`[timing] backend:check …`, AGENTS §8a). Runs every step; exits non-zero if any step failed.
"""

import subprocess
import sys
import time

from nexus.core.timing import format_duration, timing_line, utf8_console
from nexus.devtools.dev import BACKEND_ROOT

STEPS: list[tuple[str, list[str]]] = [
    ("format", [sys.executable, "-m", "ruff", "format", "--check", "."]),
    ("lint", [sys.executable, "-m", "ruff", "check", "."]),
    ("typecheck", [sys.executable, "-m", "mypy"]),
    ("test", [sys.executable, "-m", "pytest"]),
]


def main() -> None:
    utf8_console()
    total_start = time.perf_counter()
    rows: list[tuple[str, float, int]] = []
    for name, command in STEPS:
        print(f"\n$ backend-check {name}: {' '.join(command[2:])}", flush=True)
        start = time.perf_counter()
        code = subprocess.run(command, cwd=BACKEND_ROOT, check=False).returncode
        ms = (time.perf_counter() - start) * 1000
        rows.append((name, ms, code))
        print(timing_line(f"backend:check {name}", f"backend:check:{name}", ms), flush=True)

    print("\n[timing] backend:check steps")
    for name, ms, code in rows:
        print(f"  {name:<10} {format_duration(ms):>8}  {'ok' if code == 0 else 'FAILED'}")
    total_ms = (time.perf_counter() - total_start) * 1000
    print(timing_line("backend:check", "backend:check", total_ms), flush=True)
    sys.exit(0 if all(code == 0 for _, _, code in rows) else 1)


if __name__ == "__main__":
    main()
