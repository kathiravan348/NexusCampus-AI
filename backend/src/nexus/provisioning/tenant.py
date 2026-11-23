"""Cell-side P04 tenant provisioning from signed `tenant.provision` commands (NEX-127, D60).

Runs five idempotent steps (`create_tenant`, `create_keys`, `apply_profile`, `seed`, `invite_owner`), recording an M06
audit event per step (actor `system`, no personal data in `changes`). Never logs or prints owner e-mail or legal name.
"""

import asyncio
import json
import logging
import sys
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any, Literal

import httpx2
from pydantic import BaseModel, ConfigDict, Field, StringConstraints, ValidationError
from pydantic.alias_generators import to_camel
from sqlalchemy import Engine, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from nexus.commands.format import CommandPayload
from nexus.core.audit import AuditInput, changes, record_audit
from nexus.core.errors import ApiError
from nexus.core.ids import new_id
from nexus.core.permissions import CODES
from nexus.core.tenancy import TENANT_SETTING, TenantContext
from nexus.core.vault import HttpVault, Vault
from nexus.modules.m01.profiles import CORE, PROFILES
from nexus.modules.m02.keycloak_admin import HttpKeycloakAdmin, KeycloakAdmin
from nexus.modules.m83.keys import provision_key
from nexus.settings import Settings

log = logging.getLogger("nexus.provisioning")

PROVISIONING_STEPS = ("create_tenant", "create_keys", "apply_profile", "seed", "invite_owner")
_REGION_DEFAULTS: dict[str, tuple[str, list[str], str, str, str, list[int]]] = {
    "in": ("en-IN", ["en-IN", "hi-IN", "ta-IN"], "Asia/Kolkata", "INR", "IN", [0]),
    "eu": ("en-GB", ["en-GB"], "Europe/Berlin", "EUR", "DE", [0, 6]),
}
_ADMIN_PERMS = sorted(
    c for c in CODES if not c.startswith("m83.") and c not in ("m02.person.read_restricted", "m06.request.manage")
)
_SYSTEM_ROLES: tuple[tuple[str, str, list[str], list[str]], ...] = (
    ("owner", "Institution Owner", ["group", "institution", "campus"], sorted(CODES)),
    ("admin", "Administrator", ["institution", "campus"], _ADMIN_PERMS),
    (
        "teacher",
        "Teacher",
        ["campus", "class", "own"],
        ["m01.institution.read", "m02.user.read", "m07.preference.manage", "m10.device.read", "m11.assist.use"],
    ),
    ("learner", "Learner", ["own"], ["m01.institution.read", "m07.preference.manage", "m10.device.read"]),
)

EntityId = Annotated[str, StringConstraints(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9._:-]+$")]
Email = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
]
InstType = Literal["ey", "k12", "he", "voc", "tp", "sk", "onl", "grp"]


class _Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid", frozen=True)


class ProvisionOwner(_Camel):
    legal_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    work_email: Email


class ProvisionTenantArgs(_Camel):
    tenant_id: EntityId
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
    institution_type: InstType
    region: Literal["in", "eu", "us", "uk", "apac", "me"]
    plan_code: Annotated[str, StringConstraints(min_length=1, max_length=64)]
    trial_days: Annotated[int | None, Field(default=None, ge=1, le=60)] = None
    owner: ProvisionOwner


@dataclass
class StepReport:
    tenant_id: str
    steps_done: list[str] = field(default_factory=list)
    failed_step: str | None = None
    reason: str | None = None

    def to_result(self) -> dict[str, Any]:
        out: dict[str, Any] = {"tenantId": self.tenant_id, "stepsDone": list(self.steps_done)}
        if self.failed_step is not None:
            out["failedStep"] = self.failed_step
        if self.reason is not None:
            out["reason"] = self.reason
        return out


class StepRefused(Exception):
    """A step that must not run on this state; `reason` is a machine code reported to Control."""

    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


async def _bind(session: AsyncSession, tenant_id: str) -> None:
    await session.execute(text("SELECT set_config(:n, :t, true)"), {"n": TENANT_SETTING, "t": tenant_id})


async def _audit_once(
    session: AsyncSession, ctx: TenantContext, action: str, target_type: str, target_id: str, fields: list[str]
) -> None:
    exists = (
        await session.execute(
            text("SELECT 1 FROM audit_events WHERE action = :a AND target_id = :tid LIMIT 1"),
            {"a": action, "tid": target_id},
        )
    ).first()
    if exists is None:
        await record_audit(
            session,
            ctx,
            AuditInput(
                action=action,
                actor_kind="system",
                target_type=target_type,
                target_id=target_id,
                changes=changes(*fields),
            ),
        )


async def _step_create_tenant(session: AsyncSession, ctx: TenantContext, args: ProvisionTenantArgs) -> None:
    now = datetime.now(UTC)
    inst_id = f"ins-{args.tenant_id}"
    # Re-running is only allowed for a tenant this flow created; never provision into an existing institution (D22).
    existing = (
        await session.execute(text("SELECT type, region FROM tenants WHERE id = :id"), {"id": args.tenant_id})
    ).first()
    if existing is not None:
        ours = (
            await session.execute(
                text("SELECT 1 FROM institutions WHERE id = :i AND tenant_id = :t"), {"i": inst_id, "t": args.tenant_id}
            )
        ).first()
        if ours is None or existing.type != args.institution_type or existing.region != args.region:
            raise StepRefused("tenant_exists")
    await session.execute(
        text(
            "INSERT INTO tenants (id, name, type, region, created_at, updated_at) "
            "VALUES (:id, :name, :type, :region, :now, :now) ON CONFLICT (id) DO NOTHING"
        ),
        {"id": args.tenant_id, "name": args.name, "type": args.institution_type, "region": args.region, "now": now},
    )
    locale, locales, tz, currency, country, weekend = _REGION_DEFAULTS.get(args.region, _REGION_DEFAULTS["in"])
    await session.execute(
        text(
            "INSERT INTO institutions (id, tenant_id, group_id, name, type, region, status, default_locale, "
            "supported_locales, time_zone, currency, country, weekend_days, created_at, updated_at) "
            "VALUES (:id, :t, NULL, :name, :type, :region, 'active', :loc, :locs, :tz, :cur, :cty, :wk, :now, :now) "
            "ON CONFLICT (id) DO NOTHING"
        ),
        {
            "id": inst_id,
            "t": args.tenant_id,
            "name": args.name,
            "type": args.institution_type,
            "region": args.region,
            "loc": locale,
            "locs": locales,
            "tz": tz,
            "cur": currency,
            "cty": country,
            "wk": weekend,
            "now": now,
        },
    )
    await _audit_once(session, ctx, "m01.institution.created", "institution", inst_id, ["name", "type", "region"])


async def _step_create_keys(session: AsyncSession, ctx: TenantContext, vault: Vault) -> None:
    await provision_key(session, ctx, vault, purpose="tenant_data", custody="platform")


async def _step_apply_profile(
    session: AsyncSession, ctx: TenantContext, args: ProvisionTenantArgs, plan_id: str, plan_modules: list[str]
) -> None:
    await session.execute(
        text(
            "INSERT INTO tenant_plans (tenant_id, plan_id) VALUES (:t, :p) "
            "ON CONFLICT (tenant_id) DO UPDATE SET plan_id = EXCLUDED.plan_id"
        ),
        {"t": args.tenant_id, "p": plan_id},
    )
    profile = PROFILES.get(args.institution_type)
    profile_mods = set(profile.default_modules) if profile else set(CORE)
    expires = (datetime.now(UTC) + timedelta(days=args.trial_days)) if args.trial_days else None
    src = "trial" if args.trial_days else "plan"
    for mod in sorted(set(CORE)):
        await session.execute(
            text(
                "INSERT INTO entitlements (tenant_id, module_id, enabled, source, expires_at) "
                "VALUES (:t, :m, true, 'core', NULL) ON CONFLICT (tenant_id, module_id) DO NOTHING"
            ),
            {"t": args.tenant_id, "m": mod},
        )
    for mod in sorted(set(plan_modules) - set(CORE)):
        await session.execute(
            text(
                "INSERT INTO entitlements (tenant_id, module_id, enabled, source, expires_at) "
                "VALUES (:t, :m, :en, :src, :exp) ON CONFLICT (tenant_id, module_id) DO NOTHING"
            ),
            {"t": args.tenant_id, "m": mod, "en": mod in profile_mods, "src": src, "exp": expires},
        )
    await _audit_once(session, ctx, "m05.plan.applied", "tenant", args.tenant_id, ["planId", "entitlements"])


async def _step_seed(session: AsyncSession, ctx: TenantContext, args: ProvisionTenantArgs) -> None:
    now = datetime.now(UTC)
    for slug, name, scopes, perms in _SYSTEM_ROLES:
        rid = f"rol-{args.tenant_id}-{slug}"
        await session.execute(
            text(
                "INSERT INTO roles (id, tenant_id, name, system, allowed_scope_kinds, created_at, updated_at) "
                "VALUES (:id, :t, :name, true, :scopes, :now, :now) ON CONFLICT (id) DO NOTHING"
            ),
            {"id": rid, "t": args.tenant_id, "name": name, "scopes": scopes, "now": now},
        )
        for code in perms:
            await session.execute(
                text(
                    "INSERT INTO role_permissions (role_id, permission_code, tenant_id) "
                    "VALUES (:r, :c, :t) ON CONFLICT DO NOTHING"
                ),
                {"r": rid, "c": code, "t": args.tenant_id},
            )
    await session.execute(
        text(
            "INSERT INTO ai_settings (tenant_id, enabled, modules, blocked_modules, safeguarding_enabled, "
            "default_tier, provider_kind, provider_label, updated_at) VALUES (:t, false, CAST(:mods AS jsonb), "
            "ARRAY['M61', 'M83'], false, 'balanced', 'cloud', 'Anthropic Claude', :now) "
            "ON CONFLICT (tenant_id) DO NOTHING"
        ),
        {"t": args.tenant_id, "mods": json.dumps({}), "now": now},
    )
    await _audit_once(session, ctx, "m02.roles.seeded", "tenant", args.tenant_id, ["roles", "aiSettings"])


async def _step_invite_owner(
    session: AsyncSession, ctx: TenantContext, args: ProvisionTenantArgs, keycloak: KeycloakAdmin
) -> None:
    email = args.owner.work_email.strip().lower()
    domain = email.split("@", 1)[1]
    owner_role_id = f"rol-{args.tenant_id}-owner"
    owners = (
        (
            await session.execute(
                text(
                    "SELECT lower(u.email) FROM role_assignments ra JOIN users u ON u.id = ra.user_id "
                    "WHERE ra.tenant_id = :t AND ra.role_id = :r"
                ),
                {"t": args.tenant_id, "r": owner_role_id},
            )
        )
        .scalars()
        .all()
    )
    if owners and email not in owners:
        raise StepRefused("owner_exists")  # a re-run never adds a second owner
    await keycloak.ensure_organization(tenant_id=args.tenant_id, name=args.name, domain=domain)
    existing = (await session.execute(text("SELECT id FROM users WHERE lower(email) = :e"), {"e": email})).first()
    if existing is not None:
        return

    now = datetime.now(UTC)
    person_id, user_id = new_id("per"), new_id("usr")
    inst_id = f"ins-{args.tenant_id}"
    kc_id = await keycloak.invite(tenant_id=args.tenant_id, email=email, legal_name=args.owner.legal_name.strip())
    await session.execute(
        text(
            "INSERT INTO people (id, tenant_id, legal_name, is_minor, email, retention_state, created_at, updated_at) "
            "VALUES (:id, :t, :name, false, :e, 'active', :now, :now)"
        ),
        {"id": person_id, "t": args.tenant_id, "name": args.owner.legal_name.strip(), "e": email, "now": now},
    )
    await session.execute(
        text(
            "INSERT INTO users (id, tenant_id, person_id, email, idp_subject, status, mfa_enabled, passkey_count, "
            "sso_only, created_at, updated_at) "
            "VALUES (:id, :t, :p, :e, :sub, 'invited', false, 0, false, :now, :now)"
        ),
        {"id": user_id, "t": args.tenant_id, "p": person_id, "e": email, "sub": kc_id, "now": now},
    )
    await session.execute(
        text(
            "INSERT INTO role_assignments (id, tenant_id, user_id, role_id, scope_kind, scope_target_id, "
            "effective_from, granted_by) VALUES (:id, :t, :u, :r, 'institution', :inst, :from_, 'system')"
        ),
        {
            "id": new_id("ra"),
            "t": args.tenant_id,
            "u": user_id,
            "r": owner_role_id,
            "inst": inst_id,
            "from_": now.date(),
        },
    )
    await _audit_once(session, ctx, "m02.user.invited", "user", user_id, ["roleId", "scope"])


async def provision_tenant(
    settings: Settings,
    vault: Vault,
    keycloak: KeycloakAdmin,
    args: ProvisionTenantArgs,
    *,
    owner_url: str | None = None,
) -> StepReport:
    """Runs the 5 idempotent tenant provisioning steps; stops at first failure and returns machine-coded StepReport."""
    report = StepReport(tenant_id=args.tenant_id)
    if args.region != settings.region:
        report.reason = "wrong_region"
        log.info("provision tenant=%s outcome=failed reason=wrong_region", args.tenant_id)
        return report

    url = owner_url or settings.migrate_database_url.get_secret_value()
    eng = create_async_engine(url)
    maker = async_sessionmaker(eng, expire_on_commit=False)
    ctx = TenantContext(args.tenant_id)
    try:
        async with maker() as session:
            plan = (
                await session.execute(text("SELECT id, modules FROM plans WHERE code = :c"), {"c": args.plan_code})
            ).first()
        if plan is None:
            report.reason = "unknown_plan"
            log.info("provision tenant=%s outcome=failed reason=unknown_plan", args.tenant_id)
            return report

        plan_id, plan_modules = str(plan.id), list(plan.modules or [])
        runners: list[tuple[str, Any]] = [
            ("create_tenant", lambda s: _step_create_tenant(s, ctx, args)),
            ("create_keys", lambda s: _step_create_keys(s, ctx, vault)),
            ("apply_profile", lambda s: _step_apply_profile(s, ctx, args, plan_id, plan_modules)),
            ("seed", lambda s: _step_seed(s, ctx, args)),
            ("invite_owner", lambda s: _step_invite_owner(s, ctx, args, keycloak)),
        ]
        for step_name, fn in runners:
            try:
                async with maker() as session, session.begin():
                    await _bind(session, args.tenant_id)
                    await fn(session)
            except StepRefused as exc:
                report.failed_step = step_name
                report.reason = exc.reason
                log.info(
                    "provision tenant=%s step=%s outcome=failed reason=%s", args.tenant_id, step_name, report.reason
                )
                return report
            except ApiError as exc:
                report.failed_step = step_name
                report.reason = "keycloak_error" if step_name == "invite_owner" else exc.code
                log.info(
                    "provision tenant=%s step=%s outcome=failed reason=%s", args.tenant_id, step_name, report.reason
                )
                return report
            except SQLAlchemyError:
                report.failed_step = step_name
                report.reason = "db_error"
                log.info("provision tenant=%s step=%s outcome=failed reason=db_error", args.tenant_id, step_name)
                return report
            except Exception:
                report.failed_step = step_name
                report.reason = "vault_error" if step_name == "create_keys" else "step_failed"
                log.info(
                    "provision tenant=%s step=%s outcome=failed reason=%s", args.tenant_id, step_name, report.reason
                )
                return report
            report.steps_done.append(step_name)
            log.info("provision tenant=%s step=%s outcome=done", args.tenant_id, step_name)
        return report
    finally:
        await eng.dispose()


def _run_async(coro: Any) -> Any:
    def _runner() -> Any:
        if sys.platform == "win32":
            return asyncio.run(coro, loop_factory=asyncio.SelectorEventLoop)
        return asyncio.run(coro)

    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return _runner()
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(_runner).result()


class ProvisionCommandOutcome(ValueError):
    """Carries a rejected or step-failed result payload back to `agent.commands`."""

    def __init__(self, status: Literal["rejected", "failed"], result: dict[str, Any]) -> None:
        super().__init__(status)
        self.status = status
        self.result = result


def handle_tenant_provision(
    cmd: CommandPayload,
    _engine: Engine,
    settings: Settings,
    *,
    vault: Vault | None = None,
    keycloak: KeycloakAdmin | None = None,
) -> dict[str, Any]:
    """Agent handler for `tenant.provision`: SaaS cells only; self-hosted installs reject immediately."""
    if settings.install_mode != "saas":
        raise ProvisionCommandOutcome("rejected", {"reason": "self_hosted_not_allowed"})
    try:
        args = ProvisionTenantArgs.model_validate(cmd.args)
    except ValidationError:
        raise ProvisionCommandOutcome("rejected", {"reason": "invalid_args"}) from None
    if cmd.tenant_id and args.tenant_id != cmd.tenant_id:
        raise ProvisionCommandOutcome("rejected", {"reason": "invalid_args"})

    async def _run() -> StepReport:
        if vault is not None and keycloak is not None:
            return await provision_tenant(settings, vault, keycloak, args)
        async with httpx2.AsyncClient(timeout=20) as http:
            v = vault or HttpVault(settings, http)
            kc = keycloak or HttpKeycloakAdmin(settings, http)
            return await provision_tenant(settings, v, kc, args)

    report: StepReport = _run_async(_run())
    if report.failed_step is not None or report.reason is not None:
        raise ProvisionCommandOutcome("failed", report.to_result())
    return report.to_result()
