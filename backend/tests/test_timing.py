"""`[timing]` lines match the frontend harness (`frontend/scripts/timing-budgets.ts`)."""

import pytest

from nexus.core import timing


def test_budgets_come_from_the_frontend_file() -> None:
    budgets = timing.budgets()
    assert budgets["backend:start"] == 15_000
    assert budgets["backend:check"] == 180_000
    assert budgets["compose:up"] == 90_000


def test_format_duration_like_the_frontend() -> None:
    assert timing.format_duration(1234) == "1.23s"
    assert timing.format_duration(123_400) == "2m 03.4s"


def test_timing_line_ok_warn_and_no_budget() -> None:
    assert timing.timing_line("backend:start", "backend:start", 900) == (
        "[timing] backend:start: 0.90s (budget 15.0s — OK)"
    )
    assert "WARN: over budget" in timing.timing_line("backend:start", "backend:start", 20_000)
    assert timing.timing_line("x", "unknown:key", 10).endswith("(no budget)")


def test_boot_elapsed_needs_the_start_mark(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv(timing.BOOT_ENV, raising=False)
    assert timing.boot_elapsed_ms() is None
    timing.mark_boot_start()
    elapsed = timing.boot_elapsed_ms()
    assert elapsed is not None and elapsed >= 0
    monkeypatch.delenv(timing.BOOT_ENV, raising=False)
