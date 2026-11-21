import type { Commission, DealRegistration, PartnerTier } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

type Tone = NonNullable<BadgeProps["tone"]>;

export const TIER_KEY: Readonly<Record<PartnerTier, ControlMessageKey>> = {
  registered: "p12.tier.registered",
  silver: "p12.tier.silver",
  gold: "p12.tier.gold",
};

export const DEAL_STATUS: Readonly<
  Record<DealRegistration["status"], { key: ControlMessageKey; tone: Tone }>
> = {
  submitted: { key: "p12.dealStatus.submitted", tone: "info" },
  approved: { key: "p12.dealStatus.approved", tone: "success" },
  rejected: { key: "p12.dealStatus.rejected", tone: "danger" },
  expired: { key: "p12.dealStatus.expired", tone: "neutral" },
};

export const COMMISSION_STATUS: Readonly<
  Record<Commission["status"], { key: ControlMessageKey; tone: Tone }>
> = {
  pending: { key: "p12.commissionStatus.pending", tone: "neutral" },
  payable: { key: "p12.commissionStatus.payable", tone: "warning" },
  paid: { key: "p12.commissionStatus.paid", tone: "success" },
};
