import type {
  AccountStage,
  ContactKind,
  ContractKind,
  DeliveryModel,
  OpportunityStage,
  SlaTier,
} from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

export const STAGE_KEY: Readonly<Record<AccountStage, ControlMessageKey>> = {
  lead: "p01.stage.lead",
  trial: "p01.stage.trial",
  customer: "p01.stage.customer",
  churned: "p01.stage.churned",
};

export const STAGE_TONE: Readonly<Record<AccountStage, NonNullable<BadgeProps["tone"]>>> = {
  lead: "info",
  trial: "warning",
  customer: "success",
  churned: "neutral",
};

export const MODEL_KEY: Readonly<Record<DeliveryModel, ControlMessageKey>> = {
  saas_shared: "p01.model.saasShared",
  saas_dedicated: "p01.model.saasDedicated",
  self_hosted: "p01.model.selfHosted",
  hybrid: "p01.model.hybrid",
};

export const CONTACT_KEY: Readonly<Record<ContactKind, ControlMessageKey>> = {
  billing: "p01.contactKind.billing",
  technical: "p01.contactKind.technical",
  executive: "p01.contactKind.executive",
  dpo: "p01.contactKind.dpo",
};

export const OPP_STAGE_KEY: Readonly<Record<OpportunityStage, ControlMessageKey>> = {
  qualify: "p01.oppStage.qualify",
  proposal: "p01.oppStage.proposal",
  negotiation: "p01.oppStage.negotiation",
  won: "p01.oppStage.won",
  lost: "p01.oppStage.lost",
};

export const CONTRACT_KEY: Readonly<Record<ContractKind, ControlMessageKey>> = {
  saas_subscription: "p01.contractKind.saasSubscription",
  licence_perpetual: "p01.contractKind.licencePerpetual",
  licence_term: "p01.contractKind.licenceTerm",
  support: "p01.contractKind.support",
};

export const SLA_KEY: Readonly<Record<SlaTier, ControlMessageKey>> = {
  standard: "p01.sla.standard",
  priority: "p01.sla.priority",
  enterprise: "p01.sla.enterprise",
};

export const CONTRACT_STATUS_KEY: Readonly<
  Record<"draft" | "active" | "ended", ControlMessageKey>
> = {
  draft: "p01.contractStatus.draft",
  active: "p01.contractStatus.active",
  ended: "p01.contractStatus.ended",
};

/** Health bands (P01): ≥ 70 healthy, 50–69 watch, < 50 at risk. */
export function healthBand(score: number): {
  readonly key: ControlMessageKey;
  readonly tone: NonNullable<BadgeProps["tone"]>;
} {
  if (score >= 70) return { key: "p01.health.good", tone: "success" };
  if (score >= 50) return { key: "p01.health.watch", tone: "warning" };
  return { key: "p01.health.risk", tone: "danger" };
}
