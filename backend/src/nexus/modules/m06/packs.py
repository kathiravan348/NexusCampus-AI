"""Compliance packs (M06, G-6, D45): regional rules a tenant follows. Same values as the mock's
`COMPLIANCE_PACKS` (a test compares them with `demo_fixtures.json`); which packs a tenant follows is in
`tenant_compliance`.
"""

from datetime import datetime, timedelta
from typing import Literal

from nexus.core.schemas import Contract

PackCode = Literal["gdpr", "uk_gdpr", "ferpa", "coppa", "dpdp", "lgpd", "popia", "pdpa", "eu_ai_act"]
#: Deadline when a tenant follows no pack (the strictest common one).
DEFAULT_DSR_DUE_DAYS = 30


class CompliancePackOut(Contract):
    code: PackCode
    region: str
    dsr_due_days: int
    minor_age_threshold: int
    guardian_consent_for_ai: bool
    guardian_consent_for_media: bool
    retention_days_default: int


def _pack(
    code: PackCode, region: str, due: int, minor: int, ai: bool, media: bool, retention: int
) -> CompliancePackOut:
    return CompliancePackOut(
        code=code,
        region=region,
        dsr_due_days=due,
        minor_age_threshold=minor,
        guardian_consent_for_ai=ai,
        guardian_consent_for_media=media,
        retention_days_default=retention,
    )


PACKS: tuple[CompliancePackOut, ...] = (
    _pack("dpdp", "in", 30, 18, True, True, 1095),
    _pack("uk_gdpr", "eu", 30, 13, True, True, 2190),
    _pack("ferpa", "us", 45, 18, False, False, 1825),
    _pack("coppa", "us", 30, 13, True, True, 365),
    _pack("pdpa", "apac", 30, 13, True, True, 1825),
    _pack("gdpr", "eu", 30, 18, True, True, 1825),
)
BY_CODE = {p.code: p for p in PACKS}


def packs_for(codes: set[str]) -> list[CompliancePackOut]:
    """The defined packs among `codes`, in catalogue order."""
    return [p for p in PACKS if p.code in codes]


def dsr_due_at(received_at: datetime, codes: set[str]) -> datetime:
    """Due date of a data subject request: the strictest deadline of the tenant's packs."""
    days = min((p.dsr_due_days for p in packs_for(codes)), default=DEFAULT_DSR_DUE_DAYS)
    return received_at + timedelta(days=days)
