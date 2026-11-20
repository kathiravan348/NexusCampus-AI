"""Tenant-isolated vector retrieval (NEX-058, D47: PostgreSQL + pgvector only).

Chunks live in `ai_chunks` under forced RLS, so a search can only ever see the caller's tenant. Search also takes
the modules the caller may use; M61 (health) and M83 (vault) can never be stored (CHECK) or searched.

Embeddings: `hash_embedding` (deterministic multilingual bag of words, 1024 dims) for tests and dev;
`BedrockEmbedder` calls the pinned multilingual model on Bedrock in the cell's region (needs `boto3`, added with
the SaaS image, NEX-064).
"""

import hashlib
import json
import math
import re
from dataclasses import dataclass
from typing import Any, Protocol

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.ids import new_id
from nexus.core.tenancy import TenantContext

DIMS = 1024
HARD_BLOCKED = frozenset({"M61", "M83"})
#: Cosine distance above which a chunk is not a source.
MAX_DISTANCE = 0.85
_WORD = re.compile(r"[\wऀ-ॿ஀-௿]+")


def words(value: str) -> list[str]:
    return [w for w in _WORD.findall(value.lower()) if len(w) > 2]


def hash_embedding(value: str) -> list[float]:
    vec = [0.0] * DIMS
    for word in words(value):
        digest = hashlib.sha256(word.encode("utf-8")).digest()
        vec[int.from_bytes(digest[:4], "big") % DIMS] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


class Embedder(Protocol):
    async def embed(self, value: str) -> list[float]: ...


class HashEmbedder:
    async def embed(self, value: str) -> list[float]:
        return hash_embedding(value)


@dataclass
class BedrockEmbedder:
    model: str
    aws_region: str

    async def embed(self, value: str) -> list[float]:  # pragma: no cover - needs AWS
        import boto3  # type: ignore[import-not-found]

        client = boto3.client("bedrock-runtime", region_name=self.aws_region)
        body = json.dumps({"texts": [value], "input_type": "search_query"})
        result = json.loads(client.invoke_model(modelId=self.model, body=body)["body"].read())
        return [float(v) for v in result["embeddings"][0]]


def vector_literal(vec: list[float]) -> str:
    return "[" + ",".join(f"{v:.6f}" for v in vec) + "]"


@dataclass(frozen=True)
class Chunk:
    module_id: str
    record_type: str
    record_id: str
    label: str
    content: str
    distance: float


async def index_record(
    db: AsyncSession,
    ctx: TenantContext,
    embedder: Embedder,
    *,
    module_id: str,
    record_type: str,
    record_id: str,
    label: str,
    locale: str,
    content: str,
) -> None:
    if module_id in HARD_BLOCKED:
        raise ValueError(f"{module_id} data never enters the AI index")
    await db.execute(
        text(
            "INSERT INTO ai_chunks (id, tenant_id, module_id, record_type, record_id, label, locale, content, "
            "embedding) "
            "VALUES (:id, :t, :m, :rt, :rid, :l, :loc, :c, CAST(:e AS vector)) "
            "ON CONFLICT (tenant_id, module_id, record_type, record_id, locale) DO UPDATE SET "
            "label = EXCLUDED.label, content = EXCLUDED.content, embedding = EXCLUDED.embedding"
        ),
        {
            "id": new_id("aic"),
            "t": ctx.tenant_id,
            "m": module_id,
            "rt": record_type,
            "rid": record_id,
            "l": label,
            "loc": locale,
            "c": content,
            "e": vector_literal(await embedder.embed(f"{label}\n{content}")),
        },
    )


async def search(db: AsyncSession, embedder: Embedder, question: str, modules: set[str], k: int = 4) -> list[Chunk]:
    allowed = sorted(modules - HARD_BLOCKED)
    if not allowed:
        return []
    rows: Any = await db.execute(
        text(
            "SELECT module_id, record_type, record_id, label, content, embedding <=> CAST(:q AS vector) AS distance "
            "FROM ai_chunks WHERE module_id = ANY(:m) ORDER BY distance LIMIT :k"
        ),
        {"q": vector_literal(await embedder.embed(question)), "m": allowed, "k": k},
    )
    return [Chunk(*r) for r in rows.all() if r.distance is not None and r.distance <= MAX_DISTANCE]
