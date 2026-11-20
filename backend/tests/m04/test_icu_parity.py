"""The server ICU check equals formatjs (NEX-054): every catalogue message (en / hi / ta, terminology packs) and the
edge cases exported by `pnpm --filter @nexus/mocks export:fixtures`."""

import json
from pathlib import Path

from nexus.modules.m04.icu import is_valid_message

CASES = json.loads(Path(__file__).with_name("icu_cases.json").read_text(encoding="utf-8"))


def test_verdicts_equal_formatjs() -> None:
    wrong = [(c["text"], c["valid"]) for c in CASES if is_valid_message(c["text"]) != c["valid"]]
    assert wrong == []


def test_every_catalogue_message_passes() -> None:
    assert len(CASES) > 2000 and sum(c["valid"] for c in CASES) > 2000
