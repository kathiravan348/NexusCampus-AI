"""Frozen Control contract name (`frontend/packages/contracts/src/control`, D50/D56) → backend model (NEX-116)."""

from pydantic import BaseModel

from nexus.control.accounts import (
    Account,
    AccountContact,
    AccountNote,
    Commission,
    Contract,
    DealRegistration,
    Opportunity,
    Partner,
    StaffDirectoryEntry,
)
from nexus.control.analytics import AccountHealth, BusinessMetrics
from nexus.control.commercial import (
    CatalogueItem,
    CreditNote,
    DunningState,
    Invoice,
    Payment,
    Quote,
    Subscription,
    UsageRecord,
)
from nexus.control.delivery_extras import Extension, ExtensionCompatibility, ImplementationProject, Sandbox
from nexus.control.fleet import Deployment, HealthSignal
from nexus.control.licences import Licence
from nexus.control.releases import Release, Rollout
from nexus.control.staff import StaffSession
from nexus.control.support import KnowledgeArticle, SlaPolicy, SupportTicket, TicketReply
from nexus.licensing.licence import LicenceFile

CONTROL_CONTRACT_MODELS: dict[str, type[BaseModel]] = {
    "Partner": Partner,
    "Account": Account,
    "AccountContact": AccountContact,
    "Opportunity": Opportunity,
    "Contract": Contract,
    "AccountNote": AccountNote,
    "StaffDirectoryEntry": StaffDirectoryEntry,
    "StaffSession": StaffSession,
    "CatalogueItem": CatalogueItem,
    "Quote": Quote,
    "Subscription": Subscription,
    "Invoice": Invoice,
    "Payment": Payment,
    "CreditNote": CreditNote,
    "DunningState": DunningState,
    "UsageRecord": UsageRecord,
    "Licence": Licence,
    "LicenceFile": LicenceFile,
    "Deployment": Deployment,
    "HealthSignal": HealthSignal,
    "Release": Release,
    "Rollout": Rollout,
    "SupportTicket": SupportTicket,
    "TicketReply": TicketReply,
    "SlaPolicy": SlaPolicy,
    "KnowledgeArticle": KnowledgeArticle,
    "Extension": Extension,
    "ExtensionCompatibility": ExtensionCompatibility,
    "ImplementationProject": ImplementationProject,
    "Sandbox": Sandbox,
    "DealRegistration": DealRegistration,
    "Commission": Commission,
    "BusinessMetrics": BusinessMetrics,
    "AccountHealth": AccountHealth,
}
