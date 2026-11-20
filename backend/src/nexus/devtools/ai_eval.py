"""`nexus-ai-eval` (NEX-058): runs `evals/assist_basic.jsonl` through the real Assist pipeline on the dev database.

Uses the configured provider (`NEXUS_AI_PROVIDER`; `fake` by default). With `anthropic` it calls Claude and spends
credits on the dev tenant and on the API key — opt in only. Answers are checked for the expected source; the
answer text is printed so a person can judge it.
"""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from nexus.core import db
from nexus.core.tenancy import TenantContext, bind_tenant, ensure_region
from nexus.core.timing import utf8_console
from nexus.modules.m11.gateway import Gateway, build_gateway
from nexus.modules.m11.pipeline import Asker, ask
from nexus.modules.m11.retrieval import Embedder, HashEmbedder
from nexus.settings import BACKEND_ROOT, Settings, get_settings

EVALS = BACKEND_ROOT / "evals" / "assist_basic.jsonl"


def load_cases(path: Path = EVALS) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


async def run_case(
    sessions: async_sessionmaker[AsyncSession],
    settings: Settings,
    gateway: Gateway,
    embedder: Embedder,
    case: dict[str, Any],
) -> tuple[bool, str]:
    """`(passed, answer text or "")`. Everything is rolled back, so the eval never spends tenant credits."""
    who = Asker(case["tenant"], case["user"], case["person"])
    ctx = TenantContext(who.tenant_id)
    async with sessions() as session:
        await bind_tenant(session, ctx)
        await ensure_region(session, ctx, settings)
        answer, _ = await ask(session, gateway, embedder, who, case["question"], case["locale"])
        await session.rollback()
    expect = case["expect"]
    if expect is None:
        return answer is None, ""
    ok = answer is not None and any(
        s.record_type == expect["recordType"] and s.record_id == expect["recordId"] for s in answer.sources
    )
    return ok, answer.answer if answer else ""


async def _main() -> int:
    settings = get_settings()
    db.init_engine(settings)
    gateway, embedder = build_gateway(settings), HashEmbedder()
    failed = 0
    try:
        for case in load_cases():
            ok, text = await run_case(db.sessionmaker(), settings, gateway, embedder, case)
            failed += not ok
            print(f"{'PASS' if ok else 'FAIL'} {case['id']}: {text[:160]}")
    finally:
        await db.dispose_engine()
    return failed


def main() -> None:
    utf8_console()
    argparse.ArgumentParser(description="Run the Assist eval set (opt-in: may call Claude).").parse_args()
    raise SystemExit(asyncio.run(_main(), loop_factory=asyncio.SelectorEventLoop))
