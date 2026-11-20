"""Contract parity (NEX-059, ARCHITECTURE §8): every backend response model accepts and rejects the same JSON as its
frozen Zod contract. Samples and Zod's verdicts come from `pnpm --filter @nexus/mocks export:fixtures`
(`samples.json`; the mocks export test fails when it is stale).

Each valid demo row must parse. For generated variants (a field dropped, set to null, given the wrong type, or an
extra field) the backend must agree with Zod on the **shape**: cross-field rules (`custom` issues in Zod) are
checked by the services and their own tests, not by the response models.
"""

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from tests.parity.contract_map import CONTRACT_MODELS

DATA: dict[str, Any] = json.loads(Path(__file__).with_name("samples.json").read_text(encoding="utf-8"))
NAMES = [c["contract"] for c in DATA["contracts"]]


def accepts(model: type[BaseModel], sample: Any) -> bool:
    try:
        model.model_validate_json(json.dumps(sample), strict=True)
    except ValidationError:
        return False
    return True


def test_every_contract_has_a_backend_model() -> None:
    missing = [name for name in NAMES if name not in CONTRACT_MODELS]
    assert missing == [], f"no backend model mapped for: {missing}"
    assert set(CONTRACT_MODELS) == set(NAMES)


@pytest.mark.parametrize("contract", DATA["contracts"], ids=NAMES)
def test_backend_model_matches_the_contract(contract: dict[str, Any]) -> None:
    model = CONTRACT_MODELS[contract["contract"]]
    drift = []
    for case in contract["samples"]:
        expected = case["valid"] or case["shapeValid"]
        if accepts(model, case["sample"]) != expected:
            drift.append(("accepts" if expected is False else "rejects", case["sample"]))
    assert drift == [], (
        f"{contract['contract']}: backend {drift[0][0]} {json.dumps(drift[0][1])[:400]} (+{len(drift) - 1})"
    )
