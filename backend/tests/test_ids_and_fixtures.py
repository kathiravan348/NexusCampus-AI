import json
from pathlib import Path

import pytest

from nexus.core.ids import new_id, ulid
from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.seed.demo import FIXTURES, load_fixtures


def test_ulid_is_26_crockford_chars_and_sorts_by_time() -> None:
    a, b = ulid(now_ms=1_700_000_000_000), ulid(now_ms=1_700_000_000_001)
    assert len(a) == 26 and set(a) <= set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
    assert a[:10] < b[:10]


def test_new_id_has_a_prefix_and_fits_the_contract() -> None:
    value = new_id("ten")
    assert value.startswith("ten_") and 1 <= len(value) <= 128
    with pytest.raises(ValueError):
        new_id("Bad-Prefix")


def test_fixture_file_is_present_and_versioned(tmp_path: Path) -> None:
    data = load_fixtures()
    assert {t["id"] for t in data["tenants"]} == {"ten-ls", "ten-rv", "ten-nb", "ten-ax", "ten-hm"}
    stale = tmp_path / "old.json"
    stale.write_text(json.dumps({**json.loads(FIXTURES.read_text(encoding="utf-8")), "version": 0}))
    with pytest.raises(ValueError, match="re-export"):
        load_fixtures(stale)


@pytest.mark.anyio
async def test_bind_tenant_refuses_an_empty_tenant() -> None:
    with pytest.raises(ValueError):
        await bind_tenant(None, TenantContext(""))  # type: ignore[arg-type]


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"
