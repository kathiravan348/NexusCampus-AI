"""`[timing]` lines with soft budgets (AGENTS §8a, D37) — same format as `frontend/scripts/timing-budgets.ts`.

Budgets are read from that file, the single source of truth; a missing key means "no budget". A budget only
warns, it never changes an exit code.
"""

import os
import re
import sys
import time
from functools import lru_cache
from pathlib import Path

#: Set by `nexus-dev` before uvicorn starts, so the app can report boot-to-ready (`backend:start`).
BOOT_ENV = "NEXUS_BOOT_T0_NS"
_BUDGETS_FILE = Path(__file__).resolve().parents[4] / "frontend" / "scripts" / "timing-budgets.ts"


@lru_cache
def budgets() -> dict[str, int]:
    try:
        source = _BUDGETS_FILE.read_text(encoding="utf-8")
    except OSError:
        return {}
    pairs = re.findall(r'^\s*"?([\w:.-]+)"?:\s*([\d_]+),', source, flags=re.MULTILINE)
    return {key: int(value.replace("_", "")) for key, value in pairs}


def format_duration(ms: float) -> str:
    safe = max(0.0, ms)
    if safe < 60_000:
        return f"{safe / 1000:.2f}s"
    minutes = int(safe // 60_000)
    seconds = f"{(safe % 60_000) / 1000:.1f}".rjust(4, "0")
    return f"{minutes}m {seconds}s"


def timing_line(label: str, key: str, ms: float) -> str:
    budget_ms = budgets().get(key)
    if budget_ms is None:
        budget = "no budget"
    else:
        state = "WARN: over budget" if ms > budget_ms else "OK"
        budget = f"budget {budget_ms / 1000:.1f}s — {state}"
    return f"[timing] {label}: {format_duration(ms)} ({budget})"


def utf8_console() -> None:
    """Windows consoles default to a legacy code page; `[timing]` lines contain `—`."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="replace")


def mark_boot_start() -> None:
    os.environ[BOOT_ENV] = str(time.time_ns())


def boot_elapsed_ms() -> float | None:
    raw = os.environ.get(BOOT_ENV)
    if raw is None or not raw.isdigit():
        return None
    return (time.time_ns() - int(raw)) / 1_000_000
