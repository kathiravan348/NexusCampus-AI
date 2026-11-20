"""ICU MessageFormat syntax check (NEX-054, C-2): a port of the rules of `@formatjs/icu-messageformat-parser` (the
parser `@nexus/i18n` `isValidMessage` uses), so the server accepts exactly what the app can render.

Decision: no Python dependency — the maintained Python ICU parsers do not follow formatjs on tags, apostrophes and
skeletons. A parity test runs every catalogue message (en / hi / ta, terminology packs) and a set of edge cases
against the formatjs verdicts exported by `pnpm --filter @nexus/mocks export:fixtures` (`tests/m04/icu_cases.json`).

Covered: arguments `{x}`, `{x, number|date|time[, style|::skeleton]}`, `{x, plural|selectordinal [offset:n] …}` and
`{x, select …}` (an `other` option is required, selectors unique), `#` inside plural, apostrophe quoting, and
rich-text tags `<b>…</b>` (`<br/>` is literal text).
"""

PLURAL_KINDS = frozenset({"plural", "selectordinal"})
_WHITE = frozenset(map(chr, (0x09, 0x0A, 0x0B, 0x0C, 0x0D, 0x20, 0x85, 0x200E, 0x200F, 0x2028, 0x2029)))
_SYNTAX_RANGES = (
    (0x21, 0x2F), (0x3A, 0x40), (0x5B, 0x5E), (0x60, 0x60), (0x7B, 0x7E), (0xA1, 0xA7), (0xA9, 0xA9),
    (0xAB, 0xAC), (0xAE, 0xAE), (0xB0, 0xB1), (0xB6, 0xB6), (0xBB, 0xBB), (0xBF, 0xBF), (0xD7, 0xD7),
    (0xF7, 0xF7), (0x2010, 0x2027), (0x2030, 0x203E), (0x2041, 0x2053), (0x2055, 0x205E), (0x2190, 0x245F),
    (0x2500, 0x2775), (0x2794, 0x2BFF), (0x2E00, 0x2E7F), (0x3001, 0x3003), (0x3008, 0x3020), (0x3030, 0x3030),
    (0xFD3E, 0xFD3F), (0xFE45, 0xFE46),
)  # fmt: skip
_NAME_RANGES = (
    (0xC0, 0xD6), (0xD8, 0xF6), (0xF8, 0x37D), (0x37F, 0x1FFF), (0x200C, 0x200D), (0x203F, 0x2040),
    (0x2070, 0x218F), (0x2C00, 0x2FEF), (0x3001, 0xD7FF), (0xF900, 0xFDCF), (0xFDF0, 0xFFFD), (0x10000, 0xEFFFF),
)  # fmt: skip


class IcuError(Exception):
    """The message is not valid ICU MessageFormat (the formatjs error kind is the message)."""


def _in(ranges: tuple[tuple[int, int], ...], ch: str) -> bool:
    cp = ord(ch)
    return any(lo <= cp <= hi for lo, hi in ranges)


def _is_alpha(ch: str | None) -> bool:
    return ch is not None and ("a" <= ch <= "z" or "A" <= ch <= "Z")


def _is_name_char(ch: str) -> bool:
    return (ch.isascii() and (ch.isalnum() or ch in "-._")) or ch == "\xb7" or _in(_NAME_RANGES, ch)


class _Parser:
    def __init__(self, text: str) -> None:
        self.s = text
        self.i = 0

    # -- cursor ---------------------------------------------------------------------------------------------
    def eof(self) -> bool:
        return self.i >= len(self.s)

    def char(self) -> str:
        return self.s[self.i]

    def peek(self) -> str | None:
        return self.s[self.i + 1] if self.i + 1 < len(self.s) else None

    def bump_if(self, prefix: str) -> bool:
        if self.s.startswith(prefix, self.i):
            self.i += len(prefix)
            return True
        return False

    def bump_space(self) -> None:
        while not self.eof() and self.char() in _WHITE:
            self.i += 1

    def identifier(self) -> str:
        start = self.i
        while not self.eof() and self.char() not in _WHITE and not _in(_SYNTAX_RANGES, self.char()):
            self.i += 1
        return self.s[start : self.i]

    # -- grammar --------------------------------------------------------------------------------------------
    def message(self, depth: int, parent: str, expecting_close_tag: bool) -> None:
        while not self.eof():
            ch = self.char()
            if ch == "{":
                self.argument(depth, expecting_close_tag)
            elif ch == "}" and depth > 0:
                return
            elif ch == "#" and parent in PLURAL_KINDS:
                self.i += 1
            elif ch == "<" and self.peek() == "/":
                if expecting_close_tag:
                    return
                raise IcuError("UNMATCHED_CLOSING_TAG")
            elif ch == "<" and _is_alpha(self.peek()):
                self.tag(depth, parent)
            else:
                self.literal(depth, parent)

    def tag(self, depth: int, parent: str) -> None:
        self.i += 1  # <
        name = self.tag_name()
        self.bump_space()
        if self.bump_if("/>"):
            return  # self-closing tags are literal text
        if not self.bump_if(">"):
            raise IcuError("INVALID_TAG")
        self.message(depth + 1, parent, True)
        if not self.bump_if("</"):
            raise IcuError("UNCLOSED_TAG")
        if self.eof() or not _is_alpha(self.char()):
            raise IcuError("INVALID_TAG")
        if self.tag_name() != name:
            raise IcuError("UNMATCHED_CLOSING_TAG")
        self.bump_space()
        if not self.bump_if(">"):
            raise IcuError("INVALID_TAG")

    def tag_name(self) -> str:
        start = self.i
        self.i += 1
        while not self.eof() and _is_name_char(self.char()):
            self.i += 1
        return self.s[start : self.i]

    def literal(self, depth: int, parent: str) -> None:
        progressed = False
        while self.quoted(parent) or self.unquoted(depth, parent) or self.left_angle():
            progressed = True
        if not progressed:  # cannot happen with the dispatch in `message`; guards against a stuck loop
            raise IcuError("INVALID_LITERAL")

    def quoted(self, parent: str) -> bool:
        if self.eof() or self.char() != "'":
            return False
        nxt = self.peek()
        if nxt == "'":
            self.i += 2
            return True
        if nxt not in ("{", "<", ">", "}") and not (nxt == "#" and parent in PLURAL_KINDS):
            return False
        self.i += 2  # the apostrophe and the first quoted character
        while not self.eof():
            if self.char() == "'":
                if self.peek() == "'":
                    self.i += 2
                    continue
                self.i += 1
                break
            self.i += 1
        return True

    def unquoted(self, depth: int, parent: str) -> bool:
        if self.eof():
            return False
        ch = self.char()
        if ch in ("<", "{") or (ch == "#" and parent in PLURAL_KINDS) or (ch == "}" and depth > 0):
            return False
        self.i += 1
        return True

    def left_angle(self) -> bool:
        if not self.eof() and self.char() == "<" and not (_is_alpha(self.peek()) or self.peek() == "/"):
            self.i += 1
            return True
        return False

    def argument(self, depth: int, expecting_close_tag: bool) -> None:
        self.i += 1  # {
        self.bump_space()
        if self.eof():
            raise IcuError("EXPECT_ARGUMENT_CLOSING_BRACE")
        if self.char() == "}":
            raise IcuError("EMPTY_ARGUMENT")
        if not self.identifier():
            raise IcuError("MALFORMED_ARGUMENT")
        self.bump_space()
        if self.eof():
            raise IcuError("EXPECT_ARGUMENT_CLOSING_BRACE")
        if self.bump_if("}"):
            return
        if not self.bump_if(","):
            raise IcuError("MALFORMED_ARGUMENT")
        self.bump_space()
        if self.eof():
            raise IcuError("EXPECT_ARGUMENT_CLOSING_BRACE")
        self.argument_options(depth, expecting_close_tag)

    def close_argument(self) -> None:
        if not self.bump_if("}"):
            raise IcuError("EXPECT_ARGUMENT_CLOSING_BRACE")

    def argument_options(self, depth: int, expecting_close_tag: bool) -> None:
        kind = self.identifier()
        if kind == "":
            raise IcuError("EXPECT_ARGUMENT_TYPE")
        if kind in ("number", "date", "time"):
            self.simple_argument(kind)
        elif kind in ("plural", "selectordinal", "select"):
            self.bump_space()
            if not self.bump_if(","):
                raise IcuError("EXPECT_SELECT_ARGUMENT_OPTIONS")
            self.bump_space()
            selector = self.identifier()
            if kind != "select" and selector == "offset":
                if not self.bump_if(":"):
                    raise IcuError("EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE")
                self.bump_space()
                self.decimal("EXPECT_PLURAL_ARGUMENT_OFFSET_VALUE")
                self.bump_space()
                selector = self.identifier()
            self.options(depth, kind, expecting_close_tag, selector)
            self.close_argument()
        else:
            raise IcuError("INVALID_ARGUMENT_TYPE")

    def simple_argument(self, kind: str) -> None:
        self.bump_space()
        style = None
        if self.bump_if(","):
            self.bump_space()
            style = self.simple_style().rstrip()
            if not style:
                raise IcuError("EXPECT_ARGUMENT_STYLE")
        self.close_argument()
        if style is not None and style.startswith("::"):
            skeleton = style[2:].lstrip()
            if kind == "number":
                for token in skeleton.split():
                    if any(option == "" for option in token.split("/")[1:]):
                        raise IcuError("INVALID_NUMBER_SKELETON")
            elif not skeleton:
                raise IcuError("EXPECT_DATE_TIME_SKELETON")

    def simple_style(self) -> str:
        start, nested = self.i, 0
        while not self.eof():
            ch = self.char()
            if ch == "'":
                self.i += 1
                end = self.s.find("'", self.i)
                if end < 0:
                    raise IcuError("UNCLOSED_QUOTE_IN_ARGUMENT_STYLE")
                self.i = end + 1
            elif ch == "{":
                nested += 1
                self.i += 1
            elif ch == "}":
                if nested == 0:
                    break
                nested -= 1
                self.i += 1
            else:
                self.i += 1
        return self.s[start : self.i]

    def decimal(self, error: str) -> None:
        if not self.bump_if("+"):
            self.bump_if("-")
        start = self.i
        while not self.eof() and "0" <= self.char() <= "9":
            self.i += 1
        if self.i == start:
            raise IcuError(error)
        if int(self.s[start : self.i]) > 2**53 - 1:
            raise IcuError(error.replace("EXPECT", "INVALID"))

    def options(self, depth: int, kind: str, expecting_close_tag: bool, selector: str) -> None:
        label = "SELECT" if kind == "select" else "PLURAL"
        seen: set[str] = set()
        while True:
            if not selector:
                start = self.i
                if kind != "select" and self.bump_if("="):
                    self.decimal(f"EXPECT_{label}_ARGUMENT_SELECTOR")
                    selector = self.s[start : self.i]
                else:
                    break
            if selector in seen:
                raise IcuError(f"DUPLICATE_{label}_ARGUMENT_SELECTOR")
            self.bump_space()
            if not self.bump_if("{"):
                raise IcuError(f"EXPECT_{label}_ARGUMENT_SELECTOR_FRAGMENT")
            self.message(depth + 1, kind, expecting_close_tag)
            self.close_argument()
            seen.add(selector)
            self.bump_space()
            selector = self.identifier()
        if not seen:
            raise IcuError(f"EXPECT_{label}_ARGUMENT_SELECTOR")
        if "other" not in seen:
            raise IcuError("MISSING_OTHER_CLAUSE")


def check_message(text: str) -> None:
    """Raises `IcuError` when `text` is not valid ICU MessageFormat."""
    _Parser(text).message(0, "", False)


def is_valid_message(text: str) -> bool:
    try:
        check_message(text)
    except IcuError:
        return False
    return True
