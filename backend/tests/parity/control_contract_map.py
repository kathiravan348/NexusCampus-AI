"""Frozen Control contract name (`frontend/packages/contracts/src/control`, D50/D56) → backend model (NEX-116)."""

from pydantic import BaseModel

from nexus.control.accounts import (
    Account,
    AccountContact,
    AccountNote,
    Contract,
    Opportunity,
    Partner,
    StaffDirectoryEntry,
)
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
from nexus.control.fleet import Deployment, HealthSignal
from nexus.control.licences import Licence
from nexus.control.releases import Release, Rollout
from nexus.control.staff import StaffSession
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
}
