"""Canonical JSON for signatures: sorted keys, no spaces, UTF-8, no floats.

The same object always gives the same bytes, so a signature made in Nexus Control verifies in any install. Licence
payloads hold only strings, integers, booleans, lists and null; a float is refused (its text form is not stable).
"""

import json


def _check(value: object) -> None:
    if isinstance(value, float):
        raise TypeError("canonical JSON refuses floats")
    if isinstance(value, dict):
        for k, v in value.items():
            if not isinstance(k, str):
                raise TypeError("canonical JSON keys must be strings")
            _check(v)
    elif isinstance(value, list):
        for v in value:
            _check(v)


def canonical_json(value: object) -> bytes:
    _check(value)
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
