"""Control contract parity (NEX-116, same method as NEX-059): every real Control response model accepts and rejects
the same JSON as its frozen Zod contract.

Samples and Zod's verdicts come from `pnpm --filter @nexus/mocks export:fixtures` (`control_samples.json`; the mocks
export test fails when it is stale).
"""

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import BaseModel, ValidationError

from tests.parity.control_contract_map import CONTROL_CONTRACT_MODELS

DATA: dict[str, Any] = json.loads(Path(__file__).with_name("control_samples.json").read_text(encoding="utf-8"))
NAMES = [c["contract"] for c in DATA["contracts"]]


def accepts(model: type[BaseModel], sample: Any) -> bool:
    try:
        model.model_validate_json(json.dumps(sample), strict=True)
    except ValidationError:
        return False
    return True


def test_every_control_contract_has_a_backend_model() -> None:
    missing = [name for name in NAMES if name not in CONTROL_CONTRACT_MODELS]
    assert missing == [], f"no backend model mapped for: {missing}"
    assert set(CONTROL_CONTRACT_MODELS) == set(NAMES)


@pytest.mark.parametrize("contract", DATA["contracts"], ids=NAMES)
def test_control_backend_model_matches_the_contract(contract: dict[str, Any]) -> None:
    model = CONTROL_CONTRACT_MODELS[contract["contract"]]
    drift = []
    for case in contract["samples"]:
        expected = case["valid"] or case["shapeValid"]
        if accepts(model, case["sample"]) != expected:
            drift.append(("accepts" if expected is False else "rejects", case["sample"]))
    assert drift == [], (
        f"{contract['contract']}: backend {drift[0][0]} {json.dumps(drift[0][1])[:400]} (+{len(drift) - 1})"
    )
