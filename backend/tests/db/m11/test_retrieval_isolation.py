"""Vector retrieval isolation (NEX-058, D47): RLS keeps every tenant's chunks to itself; health and vault data can
never be indexed."""

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from nexus.core.tenancy import TenantContext, bind_tenant
from nexus.modules.m11.retrieval import HashEmbedder, index_record, search
from tests.db.conftest import DbUrls
from tests.db.m04.helpers import owner_sql
from tests.db.m11.helpers import sessions  # noqa: F401

LS, AX = TenantContext("ten-ls"), TenantContext("ten-ax")
UNIQUE_TEXT = "zebracorn quillfeather timetable"


@pytest.mark.anyio
async def test_search_never_returns_another_tenants_chunk(sessions: async_sessionmaker[AsyncSession]) -> None:  # noqa: F811
    embedder = HashEmbedder()
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        await index_record(
            s, LS, embedder, module_id="M01", record_type="note", record_id="note-ls-1", label="Note",
            locale="en-IN", content=UNIQUE_TEXT,
        )  # fmt: skip
    async with sessions() as s, s.begin():
        await bind_tenant(s, AX)
        seen = await search(s, embedder, UNIQUE_TEXT, {"M01", "M02"})
        assert all(c.record_id != "note-ls-1" for c in seen)  # RLS: Little Steps' chunk is invisible to Apex
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        found = await search(s, embedder, UNIQUE_TEXT, {"M01"})
        assert found and found[0].record_id == "note-ls-1"
        assert await search(s, embedder, UNIQUE_TEXT, {"M02"}) == []  # module not readable → not searched
        assert await search(s, embedder, UNIQUE_TEXT, {"M83", "M61"}) == []


@pytest.mark.anyio
async def test_health_and_vault_never_enter_the_index(
    sessions: async_sessionmaker[AsyncSession],  # noqa: F811
    test_db: DbUrls,
) -> None:
    async with sessions() as s, s.begin():
        await bind_tenant(s, LS)
        with pytest.raises(ValueError):
            await index_record(
                s, LS, HashEmbedder(), module_id="M83", record_type="key", record_id="k", label="k",
                locale="en", content="x",
            )  # fmt: skip
    vector = "[" + ",".join(["0"] * 1023 + ["1"]) + "]"
    with pytest.raises(IntegrityError):
        owner_sql(
            test_db.owner_url,
            "INSERT INTO ai_chunks (id, tenant_id, module_id, record_type, record_id, label, locale, content, "
            "embedding) VALUES ('aic-bad', 'ten-ls', 'M61', 'health', 'h', 'h', 'en', 'x', CAST(:v AS vector))",
            {"v": vector},
        )
