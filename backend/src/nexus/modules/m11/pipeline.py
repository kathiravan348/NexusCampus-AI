"""The Assist pipeline (NEX-058, ARCHITECTURE §7, A-1 to A-8). In order:

1. AI switched on (else `403 forbidden`, path `ai_off`); 2. a minor learner of an EY / K-12 institution needs a
granted `ai_features` consent (else `403`, path `consent`); 3. credits left under a hard cap (else
`429 rate_limited`, path `credits`); 4. retrieval in the tenant's own chunks, only modules AI may read (never M61 /
M83, M62 only with safeguarding) — **no source → no model call, no credit**; 5. PII redaction; 6. the model through
the gateway by the tenant's tier; 7. names restored, sources cited, `aiGenerated: true`; 8. credits and the
`ai_credits` usage meter charged together, metadata-only log (never question or answer text).
"""

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.ids import new_id
from nexus.modules.m11.gateway import CREDIT_COST, Gateway
from nexus.modules.m11.redact import Redactor
from nexus.modules.m11.retrieval import HARD_BLOCKED, Embedder, search
from nexus.modules.m11.schemas import AiCreditOut, AssistAnswerOut, SourceOut, TierName

SYSTEM = (
    "You are Nexus Assist for one school or college. Answer only from the context records; if they do not answer "
    "the question, say so. Reply in the language of the question, briefly. Placeholders like [PERSON_1] stand for "
    "people: keep them exactly as written."
)
CREDIT_SELECT = "SELECT tenant_id, period_start, period_end, granted, used, hard_cap FROM ai_credits"


@dataclass(frozen=True)
class Asker:
    tenant_id: str
    user_id: str
    person_id: str


def refused(status: int, code: str, path: str, message: str) -> ApiError:
    return ApiError(status, code, message, [ApiErrorDetail(path=path, message=message)])  # type: ignore[arg-type]


async def settings_row(db: AsyncSession) -> dict[str, Any]:
    row = (await db.execute(text("SELECT * FROM ai_settings"))).mappings().first()
    if row is None:
        raise ApiError(404, "not_found", "Not found.")
    return dict(row)


async def current_credit(db: AsyncSession) -> AiCreditOut:
    row = (await db.execute(text(CREDIT_SELECT + " ORDER BY period_start DESC LIMIT 1 FOR UPDATE"))).mappings().first()
    if row is None:
        raise ApiError(404, "not_found", "Not found.")
    return AiCreditOut.model_validate(dict(row))


async def missing_minor_consent(db: AsyncSession, person_id: str) -> bool:
    row = await db.execute(
        text(
            "SELECT p.is_minor, (SELECT type FROM institutions ORDER BY created_at, id LIMIT 1) AS kind, "
            "EXISTS (SELECT 1 FROM consents c WHERE c.person_id = p.id AND c.purpose = 'ai_features' "
            "AND c.status = 'granted') AS consented FROM people p WHERE p.id = :p"
        ),
        {"p": person_id},
    )
    found = row.first()
    return bool(found and found.is_minor and found.kind in ("ey", "k12") and not found.consented)


async def readable_modules(db: AsyncSession, settings: dict[str, Any]) -> set[str]:
    """Modules switched on for AI, entitled to the tenant, never hard-blocked; M62 only with safeguarding."""
    on = {m for m, v in (settings["modules"] or {}).items() if v}
    entitled = set((await db.execute(text("SELECT module_id FROM entitlements WHERE enabled"))).scalars())
    blocked = set(settings["blocked_modules"]) | HARD_BLOCKED
    if not settings["safeguarding_enabled"]:
        blocked.add("M62")
    return (on & entitled) - blocked


async def _log(db: AsyncSession, who: Asker, locale: str, tier: str, model: str, outcome: str, **n: int) -> None:
    await db.execute(
        text(
            "INSERT INTO ai_answer_log (id, tenant_id, user_id, locale, tier, model, outcome, source_count, "
            "credits_used, input_tokens, output_tokens, created_at) VALUES (:id, :t, :u, :l, :tier, :m, :o, :s, :c, "
            ":i, :out, :at)"
        ),
        {
            "id": new_id("ail"),
            "t": who.tenant_id,
            "u": who.user_id,
            "l": locale,
            "tier": tier,
            "m": model,
            "o": outcome,
            "s": n.get("sources", 0),
            "c": n.get("credits", 0),
            "i": n.get("input_tokens", 0),
            "out": n.get("output_tokens", 0),
            "at": datetime.now(UTC),
        },
    )


async def charge(db: AsyncSession, credit: AiCreditOut, cost: int) -> AiCreditOut:
    """Credits and the `ai_credits` usage meter of the same period move together (D16: one number)."""
    used = credit.used + cost
    await db.execute(
        text("UPDATE ai_credits SET used = :u WHERE period_start = :s"), {"u": used, "s": credit.period_start}
    )
    await db.execute(
        text("UPDATE usage_meters SET used = :u WHERE metric = 'ai_credits' AND period_start = :s"),
        {"u": used, "s": credit.period_start},
    )
    return credit.model_copy(update={"used": used})


async def ask(
    db: AsyncSession, gateway: Gateway, embedder: Embedder, who: Asker, question: str, locale: str
) -> tuple[AssistAnswerOut | None, AiCreditOut]:
    settings = await settings_row(db)
    if not settings["enabled"]:
        raise refused(403, "forbidden", "ai_off", "AI is switched off")
    if await missing_minor_consent(db, who.person_id):
        raise refused(403, "forbidden", "consent", "A guardian has not consented to AI features")
    credit = await current_credit(db)
    if credit.hard_cap and credit.used >= credit.granted:
        raise refused(429, "rate_limited", "credits", "No AI credits left")
    tier: TierName = settings["default_tier"] if settings["default_tier"] in CREDIT_COST else "balanced"
    chunks = await search(db, embedder, question, await readable_modules(db, settings))
    if not chunks:
        await _log(db, who, locale, tier, "-", "no_source")
        return None, credit
    names = list((await db.execute(text("SELECT legal_name FROM people"))).scalars())
    redactor = Redactor(names)
    context = "\n".join(
        f"[{i + 1}] {redactor.redact(c.label)}: {redactor.redact(c.content)}" for i, c in enumerate(chunks)
    )
    prompt = f"Context:\n{context}\n\nQuestion: {redactor.redact(question)}\nAnswer in {locale}."
    completion = await gateway.answer(tier, SYSTEM, prompt)
    tokens = {"input_tokens": completion.input_tokens, "output_tokens": completion.output_tokens}
    if completion.refused or not completion.text:
        await _log(db, who, locale, tier, completion.model, "refused", sources=len(chunks), **tokens)
        return None, credit
    cost = min(CREDIT_COST[tier], credit.granted - credit.used) if credit.hard_cap else CREDIT_COST[tier]
    credit = await charge(db, credit, cost)
    await _log(db, who, locale, tier, completion.model, "answered", sources=len(chunks), credits=cost, **tokens)
    answer = AssistAnswerOut(
        id=new_id("asa"),
        tenant_id=who.tenant_id,
        question=question,
        answer=redactor.restore(completion.text)[:20000],
        locale=locale,
        ai_generated=True,
        sources=[
            SourceOut(module_id=c.module_id, record_type=c.record_type, record_id=c.record_id, label=c.label)
            for c in chunks
        ],
        tier=tier,
        credits_used=cost,
        created_at=datetime.now(UTC),
    )
    return answer, credit
