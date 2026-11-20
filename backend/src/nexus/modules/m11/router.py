"""M11 Nexus Assist API (NEX-058): settings, credits, ask. Same bodies, reasons and audit as the mock
(`handlers/m11.ts`); the answer comes from the guarded pipeline (`pipeline.py`) through the gateway."""

import json
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Body, Depends, Request
from sqlalchemy import text

from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.bodies import parse_body
from nexus.core.errors import ApiError, ApiErrorDetail
from nexus.core.pagination import Page, PageQuery, page_query
from nexus.core.permissions import Authorized, require
from nexus.core.validation import is_locale
from nexus.modules.m11.gateway import Gateway
from nexus.modules.m11.pipeline import CREDIT_SELECT, Asker, ask, settings_row
from nexus.modules.m11.retrieval import HARD_BLOCKED, Embedder
from nexus.modules.m11.schemas import AiCreditOut, AiSettingsIn, AiSettingsOut, AskIn, AskOut

router = APIRouter(prefix="/api/v1", tags=["m11 nexus assist"])
Anyone = Annotated[Authorized, Depends(require(None, "M11"), scope="function")]
AssistUser = Annotated[Authorized, Depends(require("m11.assist.use", "M11"), scope="function")]
SettingsManager = Annotated[Authorized, Depends(require("m11.settings.manage", "M11"), scope="function")]
JsonBody = Annotated[Any, Body()]


def settings_out(row: dict[str, Any]) -> AiSettingsOut:
    return AiSettingsOut(
        tenant_id=row["tenant_id"],
        enabled=row["enabled"],
        modules=row["modules"],
        blocked_modules=row["blocked_modules"],
        safeguarding_enabled=row["safeguarding_enabled"],
        pii_redaction=True,
        minor_guardian_consent_required=True,
        default_tier=row["default_tier"],
        provider={"kind": row["provider_kind"], "label": row["provider_label"]},  # type: ignore[arg-type]
        updated_at=row["updated_at"],
    )


@router.get("/ai/settings", response_model=AiSettingsOut)
async def get_settings(auth: Anyone) -> AiSettingsOut:
    """Assist users read it too: the panel shows the AI-off state. Never carries keys."""
    if not (auth.grants.has("m11.assist.use") or auth.grants.has("m11.settings.manage")):
        raise ApiError(403, "forbidden", "Your role does not allow this.")
    return settings_out(await settings_row(auth.ctx.db))


@router.get("/ai/credits", response_model=Page[AiCreditOut])
async def credits(auth: SettingsManager, page: Annotated[PageQuery, Depends(page_query)]) -> Page[AiCreditOut]:
    db = auth.ctx.db
    total = (await db.execute(text("SELECT count(*) FROM ai_credits"))).scalar_one()
    rows = await db.execute(
        text(CREDIT_SELECT + " ORDER BY period_start DESC LIMIT :n OFFSET :o"), {"n": page.page_size, "o": page.offset}
    )
    return Page.of([AiCreditOut.model_validate(dict(r)) for r in rows.mappings()], int(total), page)


@router.post("/assist/ask", response_model=AskOut)
async def assist(auth: AssistUser, request: Request, body: JsonBody) -> AskOut:
    """`answer: null` = nothing in the institution's records matches (no model call, no credit)."""
    data = parse_body(AskIn, body)
    if not is_locale(data.locale):
        raise ApiError(
            400,
            "invalid_request",
            "The request is not valid.",
            [ApiErrorDetail(path="locale", message="Must be a canonical BCP 47 locale")],
        )
    gateway: Gateway = request.app.state.ai_gateway
    embedder: Embedder = request.app.state.ai_embedder
    ctx = auth.ctx
    who = Asker(ctx.tenant.tenant_id, ctx.user_id, ctx.person_id)
    answer, credit = await ask(ctx.db, gateway, embedder, who, data.question, data.locale)
    return AskOut(answer=answer, credits=credit)


@router.put("/ai/settings", response_model=AiSettingsOut)
async def put_settings(auth: SettingsManager, body: JsonBody) -> AiSettingsOut:
    """Health (M61) and the vault (M83) can never be switched on → 400; safeguarding needs its own switch."""
    data = parse_body(AiSettingsIn, body)
    bad = [
        ApiErrorDetail(path=f"modules.{m}", message=f"AI can never read {m}")
        for m in sorted(HARD_BLOCKED)
        if data.modules.get(m)
    ]
    if data.modules.get("M62") and not data.safeguarding_enabled:
        bad.append(ApiErrorDetail(path="modules.M62", message="Safeguarding AI needs safeguardingEnabled"))
    if bad:
        raise ApiError(400, "invalid_request", "The request is not valid.", bad)
    db = auth.ctx.db
    current = await settings_row(db)
    blocked = set(current["blocked_modules"]) | HARD_BLOCKED
    blocked = blocked - {"M62"} if data.safeguarding_enabled else blocked | {"M62"}
    await db.execute(
        text(
            "UPDATE ai_settings SET enabled = :e, modules = CAST(:m AS jsonb), blocked_modules = :b, "
            "safeguarding_enabled = :s, default_tier = :t, updated_at = :at"
        ),
        {
            "e": data.enabled,
            "m": json.dumps(data.modules),
            "b": sorted(blocked),
            "s": data.safeguarding_enabled,
            "t": data.default_tier,
            "at": datetime.now(UTC),
        },
    )
    await record_audit(
        db,
        auth.ctx.tenant,
        AuditInput(
            action="m11.settings.updated",
            actor_kind="user",
            actor_id=auth.ctx.user_id,
            target_type="aiSettings",
            changes=changes("enabled", "modules", "safeguardingEnabled", "defaultTier"),
        ),
    )
    return settings_out(await settings_row(db))
