"""Frozen contract name (`frontend/packages/contracts`, D43) → the backend model that serves it (NEX-059)."""

from pydantic import BaseModel

from nexus.core.errors import ApiErrorEnvelope
from nexus.core.events import DomainEvent
from nexus.modules.m01.schemas import CalendarOut, CampusOut, GroupOut, InstitutionOut, LocaleSettings, TypeProfileOut
from nexus.modules.m02.schemas import (
    PermissionOut,
    PersonOut,
    RoleAssignmentOut,
    RoleOut,
    RoleProfileOut,
    SessionOut,
    UserOut,
)
from nexus.modules.m02.sso import SsoProviderOut
from nexus.modules.m03.schemas import FontOut, ThemeOut
from nexus.modules.m04.schemas import RevisionOut, TextOverrideOut
from nexus.modules.m05.router import EntitlementOut, PlanOut
from nexus.modules.m05.usage import UsageMeterOut
from nexus.modules.m06.packs import CompliancePackOut
from nexus.modules.m06.schemas import AuditEventOut, ConsentOut, DataSubjectRequestOut
from nexus.modules.m07.schemas import DeliveryOut, PreferenceOut, TemplateOut
from nexus.modules.m10.service import ConflictOut, DeviceOut
from nexus.modules.m11.schemas import AiCreditOut, AiSettingsOut, AssistAnswerOut
from nexus.modules.m83.access import AccessGrantOut, AccessRequestOut, BreakGlassNoticeOut
from nexus.modules.m83.keys import KeyStatusOut

CONTRACT_MODELS: dict[str, type[BaseModel]] = {
    "ApiError": ApiErrorEnvelope,
    "DomainEvent": DomainEvent,
    "LocaleSettings": LocaleSettings,
    "Group": GroupOut,
    "Institution": InstitutionOut,
    "Campus": CampusOut,
    "InstitutionTypeProfile": TypeProfileOut,
    "AcademicCalendar": CalendarOut,
    "Person": PersonOut,
    "RoleProfile": RoleProfileOut,
    "User": UserOut,
    "Session": SessionOut,
    "SsoProvider": SsoProviderOut,
    "Permission": PermissionOut,
    "Role": RoleOut,
    "RoleAssignment": RoleAssignmentOut,
    "Theme": ThemeOut,
    "Font": FontOut,
    "TextOverride": TextOverrideOut,
    "TextOverrideRevision": RevisionOut,
    "Plan": PlanOut,
    "Entitlement": EntitlementOut,
    "UsageMeter": UsageMeterOut,
    "AuditEvent": AuditEventOut,
    "Consent": ConsentOut,
    "DataSubjectRequest": DataSubjectRequestOut,
    "CompliancePack": CompliancePackOut,
    "NotificationTemplate": TemplateOut,
    "NotificationDelivery": DeliveryOut,
    "NotificationPreference": PreferenceOut,
    "DeviceSync": DeviceOut,
    "SyncConflict": ConflictOut,
    "AiSettings": AiSettingsOut,
    "AiCredit": AiCreditOut,
    "AssistAnswer": AssistAnswerOut,
    "KeyStatus": KeyStatusOut,
    "AccessRequest": AccessRequestOut,
    "AccessGrant": AccessGrantOut,
    "BreakGlassNotice": BreakGlassNoticeOut,
}
