"""PII redaction before any model call (NEX-058, A-2): e-mail addresses, phone numbers and the tenant's people's
names become placeholders (`[PERSON_1]`, `[EMAIL_1]`, `[PHONE_1]`); the answer is restored afterwards. The map
stays in memory for one request only."""

import re
from dataclasses import dataclass, field

EMAIL = re.compile(r"[^\s@<>()\[\]]+@[^\s@<>()\[\]]+\.[A-Za-z]{2,}")
PHONE = re.compile(r"(?<!\w)\+?\d[\d\s-]{7,}\d(?!\w)")


@dataclass
class Redactor:
    names: list[str]
    mapping: dict[str, str] = field(default_factory=dict)

    def _token(self, kind: str, value: str) -> str:
        for token, original in self.mapping.items():
            if original == value:
                return token
        token = f"[{kind}_{sum(1 for t in self.mapping if t.startswith(f'[{kind}_')) + 1}]"
        self.mapping[token] = value
        return token

    def redact(self, value: str) -> str:
        out = EMAIL.sub(lambda m: self._token("EMAIL", m.group(0)), value)
        out = PHONE.sub(lambda m: self._token("PHONE", m.group(0)), out)
        for name in sorted({n for n in self.names if len(n) > 2}, key=len, reverse=True):
            if name in out:
                out = out.replace(name, self._token("PERSON", name))
        return out

    def restore(self, value: str) -> str:
        for token, original in self.mapping.items():
            value = value.replace(token, original)
        return value
