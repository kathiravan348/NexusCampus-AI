"""The server contrast guard equals `@nexus/ui-core/contrast` (NEX-053): same tokens, pairs, ratios and failures
for the sample themes exported by `pnpm --filter @nexus/mocks export:fixtures`."""

import math

import pytest

from nexus.modules.m03.contrast import (
    COLOR_TOKEN_NAMES,
    CONTRAST_PAIRS,
    DEFAULT_COLORS,
    check_theme,
    contrast_ratio,
    parity_cases,
    relative_luminance,
)

CASES = parity_cases()


def test_known_values() -> None:
    assert contrast_ratio("#000000", "#FFFFFF") == pytest.approx(21.0)
    assert contrast_ratio("#777777", "#777777") == 1.0
    assert relative_luminance("#FFFFFF") == 1.0
    with pytest.raises(ValueError):
        relative_luminance("#FFF")


def test_tokens_and_pairs_are_complete() -> None:
    assert len(CONTRAST_PAIRS) >= 40 and len(COLOR_TOKEN_NAMES) >= 30
    for pair in CONTRAST_PAIRS:
        assert pair.min_ratio in (3.0, 4.5)
        assert pair.fg in DEFAULT_COLORS["light"] and pair.bg in DEFAULT_COLORS["dark"]


@pytest.mark.parametrize("case", CASES, ids=[f"case{i}" for i in range(len(CASES))])
def test_ratios_and_failures_equal_the_typescript_guard(case: dict[str, object]) -> None:
    light, dark = case["light"], case["dark"]
    assert isinstance(light, dict) and isinstance(dark, dict)
    for r in case["ratios"]:  # type: ignore[attr-defined]
        colors = {**DEFAULT_COLORS[r["theme"]], **(light if r["theme"] == "light" else dark)}
        assert math.isclose(contrast_ratio(colors[r["fg"]], colors[r["bg"]]), r["ratio"], rel_tol=1e-12), r
    ours = [(f.theme, f.pair.fg, f.pair.bg) for f in check_theme(light, dark)]
    assert ours == [(f["theme"], f["fg"], f["bg"]) for f in case["failures"]]  # type: ignore[attr-defined]


def test_the_samples_cover_passing_and_failing_themes() -> None:
    counts = [len(c["failures"]) for c in CASES]
    assert 0 in counts and any(n > 0 for n in counts)
