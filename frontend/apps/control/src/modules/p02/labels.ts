import type { CatalogueItemKind, PriceUnit, QuoteStatus } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

export const KIND_KEY: Readonly<Record<CatalogueItemKind, ControlMessageKey>> = {
  saas_plan: "p02.kind.saasPlan",
  addon: "p02.kind.addon",
  ai_credit_pack: "p02.kind.aiCreditPack",
  licence_edition: "p02.kind.licenceEdition",
  support: "p02.kind.support",
};

export const UNIT_KEY: Readonly<Record<PriceUnit, ControlMessageKey>> = {
  per_learner_month: "p02.unit.perLearnerMonth",
  per_learner_year: "p02.unit.perLearnerYear",
  flat_month: "p02.unit.flatMonth",
  flat_year: "p02.unit.flatYear",
  per_pack: "p02.unit.perPack",
};

export const QUOTE_STATUS_KEY: Readonly<Record<QuoteStatus, ControlMessageKey>> = {
  draft: "p02.status.draft",
  sent: "p02.status.sent",
  accepted: "p02.status.accepted",
  expired: "p02.status.expired",
};

export const QUOTE_STATUS_TONE: Readonly<Record<QuoteStatus, NonNullable<BadgeProps["tone"]>>> = {
  draft: "neutral",
  sent: "info",
  accepted: "success",
  expired: "warning",
};
