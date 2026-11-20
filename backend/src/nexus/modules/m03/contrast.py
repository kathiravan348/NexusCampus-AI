"""Server-side contrast guard (NEX-053, C-1, WCAG 2.2 AA): the same maths and pair list as
`@nexus/ui-core/contrast` (`checkTheme`). Tokens, pairs and the TypeScript results for a sample set come from
`design_tokens.json`, written by `pnpm --filter @nexus/mocks export:fixtures`; a parity test compares them.
"""

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

ThemeName = Literal["light", "dark"]
MODES: tuple[ThemeName, ...] = ("light", "dark")
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")

_TOKENS: dict[str, Any] = json.loads(Path(__file__).with_name("design_tokens.json").read_text(encoding="utf-8"))
COLOR_TOKEN_NAMES = frozenset(t["name"] for t in _TOKENS["colors"])
RADIUS_TOKEN_NAMES = frozenset(_TOKENS["radius"])
DEFAULT_COLORS: dict[ThemeName, dict[str, str]] = {
    mode: {t["name"]: t[mode] for t in _TOKENS["colors"]} for mode in MODES
}


@dataclass(frozen=True)
class ContrastPair:
    fg: str
    bg: str
    #: 4.5 for normal text; 3 for large text, icons, focus rings and borders (WCAG 2.2 SC 1.4.11).
    min_ratio: float


@dataclass(frozen=True)
class ContrastFailure:
    theme: ThemeName
    pair: ContrastPair
    ratio: float

    @property
    def message(self) -> str:
        p = self.pair
        return f"{p.fg} on {p.bg} is {self.ratio:.2f}:1 (needs {p.min_ratio:g}:1)"


CONTRAST_PAIRS = tuple(ContrastPair(p["fg"], p["bg"], float(p["minRatio"])) for p in _TOKENS["contrastPairs"])


def _channel(hex_color: str, offset: int) -> float:
    v = int(hex_color[offset : offset + 2], 16) / 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def relative_luminance(hex_color: str) -> float:
    """WCAG 2.2 relative luminance of a `#RRGGBB` colour."""
    if not HEX.fullmatch(hex_color):
        raise ValueError(f"Not a #RRGGBB colour: {hex_color}")
    return 0.2126 * _channel(hex_color, 1) + 0.7152 * _channel(hex_color, 3) + 0.0722 * _channel(hex_color, 5)


def contrast_ratio(a: str, b: str) -> float:
    """WCAG 2.2 contrast ratio, from 1 (same colour) to 21 (black on white)."""
    la, lb = relative_luminance(a), relative_luminance(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def check_theme(light: dict[str, str], dark: dict[str, str]) -> list[ContrastFailure]:
    """Every pair that fails in either theme once the overrides are merged over the defaults (empty = safe)."""
    failures = []
    for mode in MODES:
        colors = {**DEFAULT_COLORS[mode], **(light if mode == "light" else dark)}
        for pair in CONTRAST_PAIRS:
            fg, bg = colors.get(pair.fg), colors.get(pair.bg)
            if fg is None or bg is None:
                continue
            ratio = contrast_ratio(fg, bg)
            if ratio < pair.min_ratio:
                failures.append(ContrastFailure(mode, pair, ratio))
    return failures


def parity_cases() -> list[dict[str, Any]]:
    """The TypeScript guard's results for the sample themes (for the parity test)."""
    cases: list[dict[str, Any]] = _TOKENS["cases"]
    return cases
