"""ICU message rendering for notifications (NEX-056). Messages are checked with `m04.icu.check_message` first, so
this renderer only walks valid text (same grammar as the check: apostrophe quoting, `#` in plurals, tags).

Formatting is deliberately plain until real providers arrive (Stage 2): numbers as digits, dates `YYYY-MM-DD`,
times `HH:MM` (UTC), tags dropped (their text kept). Plural categories follow CLDR for the default languages
(D42: en, hi, ta). `sample_values` gives the same sample values as the app's template preview
(`formatMessagePreview`): numbers 3, dates 2026-06-15T09:30Z, a select's first option, `[name]` for arguments.
"""

from datetime import UTC, datetime
from typing import Any

from nexus.modules.m04.icu import PLURAL_KINDS, _Parser, check_message

SAMPLE_DATE = datetime(2026, 6, 15, 9, 30, tzinfo=UTC)


def plural_category(locale: str, n: float, ordinal: bool = False) -> str:
    lang = locale.split("-")[0]
    whole = float(n).is_integer()
    if ordinal:
        if lang == "en" and whole:
            i = int(n)
            if i % 10 == 1 and i % 100 != 11:
                return "one"
            if i % 10 == 2 and i % 100 != 12:
                return "two"
            if i % 10 == 3 and i % 100 != 13:
                return "few"
        if lang == "hi" and whole:
            return {1: "one", 2: "two", 3: "two", 4: "few", 6: "many"}.get(int(n), "other")
        return "other"
    if lang == "hi":
        return "one" if (int(n) == 0 or n == 1) else "other"  # i = 0 or n = 1
    return "one" if n == 1 and whole else "other"  # en, ta


def _format(value: Any, kind: str, style: str) -> str:
    if kind == "argument":
        return value.isoformat() if isinstance(value, datetime) else str(value)
    if kind == "number":
        if isinstance(value, (int, float)):
            if style.strip() == "percent":
                return f"{value * 100:g}%"
            return str(int(value)) if float(value).is_integer() else str(value)
        return str(value)
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return str(value)
    if isinstance(value, datetime):
        at = value.astimezone(UTC)
        return at.strftime("%Y-%m-%d") if kind == "date" else at.strftime("%H:%M")
    return str(value)


class _Renderer(_Parser):
    def __init__(self, text: str, values: dict[str, Any], locale: str) -> None:
        super().__init__(text)
        self.values, self.locale = values, locale

    def render(self, depth: int, parent: str, pound: float | None) -> str:
        out: list[str] = []
        while not self.eof():
            ch = self.char()
            if ch == "{":
                out.append(self.render_argument(depth))
            elif ch == "}" and depth > 0:
                break
            elif ch == "#" and parent in PLURAL_KINDS:
                self.i += 1
                out.append(_format(pound, "number", "") if pound is not None else "#")
            elif ch == "<" and self.peek() == "/":
                break
            elif ch == "<" and self.peek() is not None and self.peek().isascii() and self.peek().isalpha():  # type: ignore[union-attr]
                out.append(self.render_tag(depth, parent, pound))
            else:
                out.append(self.render_literal(depth, parent))
        return "".join(out)

    def render_tag(self, depth: int, parent: str, pound: float | None) -> str:
        start = self.i
        self.i += 1
        self.tag_name()
        self.bump_space()
        if self.bump_if("/>"):
            return self.s[start : self.i]
        self.bump_if(">")
        inner = self.render(depth + 1, parent, pound)
        self.bump_if("</")
        self.tag_name()
        self.bump_space()
        self.bump_if(">")
        return inner

    def render_literal(self, depth: int, parent: str) -> str:
        start = self.i
        if self.quoted(parent):
            raw = self.s[start : self.i]
            if raw == "''":
                return "'"
            inner = raw[1:-1] if raw.endswith("'") and len(raw) > 2 else raw[1:]
            return inner.replace("''", "'")
        if self.unquoted(depth, parent) or self.left_angle():
            return self.s[start : self.i]
        self.i += 1
        return self.s[start : self.i]

    def render_argument(self, depth: int) -> str:
        self.i += 1
        self.bump_space()
        name = self.identifier()
        self.bump_space()
        value = self.values.get(name)
        if self.bump_if("}"):
            return f"{{{name}}}" if value is None else _format(value, "argument", "")
        self.bump_if(",")
        self.bump_space()
        kind = self.identifier()
        if kind in ("number", "date", "time"):
            self.bump_space()
            style = ""
            if self.bump_if(","):
                self.bump_space()
                style = self.simple_style()
            self.bump_if("}")
            return f"{{{name}}}" if value is None else _format(value, kind, style)
        return self.render_options(depth, kind, value)

    def render_options(self, depth: int, kind: str, value: Any) -> str:
        self.bump_space()
        self.bump_if(",")
        self.bump_space()
        selector = self.identifier()
        offset = 0
        if kind != "select" and selector == "offset":
            self.bump_if(":")
            self.bump_space()
            start = self.i
            self.decimal("x")
            offset = int(self.s[start : self.i])
            self.bump_space()
            selector = self.identifier()
        number = float(value) if kind != "select" and isinstance(value, (int, float)) else None
        wanted: list[str] = []
        if kind == "select":
            wanted = [str(value), "other"]
        elif number is not None:
            wanted = [f"={int(number)}" if number.is_integer() else "", "other"]
            wanted.insert(1, plural_category(self.locale, number - offset, ordinal=kind == "selectordinal"))
        chosen: dict[str, str] = {}
        while True:
            if not selector:
                start = self.i
                if kind != "select" and self.bump_if("="):
                    self.decimal("x")
                    selector = self.s[start : self.i]
                else:
                    break
            self.bump_space()
            self.bump_if("{")
            pound = number - offset if number is not None else None
            chosen[selector] = self.render(depth + 1, kind, pound)
            self.bump_if("}")
            self.bump_space()
            selector = self.identifier()
        self.bump_if("}")
        return next((chosen[w] for w in wanted if w in chosen), chosen.get("other", ""))


def render(text: str, values: dict[str, Any], locale: str) -> str:
    """Renders valid ICU `text` with `values`; a missing value shows as `{name}`."""
    check_message(text)
    return _Renderer(text, values, locale).render(0, "", None)


def sample_values(text: str) -> dict[str, Any]:
    """The preview's sample values for every placeholder in `text` (same as `formatMessagePreview`)."""
    values: dict[str, Any] = {}

    class _Collect(_Renderer):
        def render_argument(self, depth: int) -> str:
            save = self.i
            self.i += 1
            self.bump_space()
            name = self.identifier()
            self.bump_space()
            if self.bump_if(","):
                self.bump_space()
                kind = self.identifier()
                values.setdefault(
                    name,
                    3
                    if kind in ("number", "plural", "selectordinal")
                    else SAMPLE_DATE
                    if kind in ("date", "time")
                    else None,
                )
                if kind == "select" and values[name] is None:
                    self.bump_space()
                    self.bump_if(",")
                    self.bump_space()
                    values[name] = self.identifier() or "other"
            else:
                values.setdefault(name, f"[{name}]")
            self.i = save
            return super().render_argument(depth)

    _Collect(text, values, "en").render(0, "", None)
    return values
