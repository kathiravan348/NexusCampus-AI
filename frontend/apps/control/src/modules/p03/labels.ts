import type {
  BillingPeriod,
  DunningStage,
  InvoiceStatus,
  PaymentGateway,
  PaymentMethod,
  SubscriptionStatus,
} from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

type Tone = NonNullable<BadgeProps["tone"]>;

export const PERIOD_KEY: Readonly<Record<BillingPeriod, ControlMessageKey>> = {
  monthly: "p03.period.monthly",
  annual: "p03.period.annual",
};

export const SUB_STATUS: Readonly<
  Record<SubscriptionStatus, { key: ControlMessageKey; tone: Tone }>
> = {
  trialing: { key: "p03.subStatus.trialing", tone: "warning" },
  active: { key: "p03.subStatus.active", tone: "success" },
  past_due: { key: "p03.subStatus.pastDue", tone: "danger" },
  cancelled: { key: "p03.subStatus.cancelled", tone: "neutral" },
};

export const INV_STATUS: Readonly<Record<InvoiceStatus, { key: ControlMessageKey; tone: Tone }>> = {
  draft: { key: "p03.invStatus.draft", tone: "neutral" },
  open: { key: "p03.invStatus.open", tone: "info" },
  paid: { key: "p03.invStatus.paid", tone: "success" },
  overdue: { key: "p03.invStatus.overdue", tone: "danger" },
  void: { key: "p03.invStatus.void", tone: "neutral" },
};

export const METHOD_KEY: Readonly<Record<PaymentMethod, ControlMessageKey>> = {
  card: "p03.method.card",
  upi: "p03.method.upi",
  netbanking: "p03.method.netbanking",
  bank_transfer: "p03.method.bankTransfer",
};

export const GATEWAY_KEY: Readonly<Record<PaymentGateway, ControlMessageKey>> = {
  razorpay: "p03.gateway.razorpay",
  stripe: "p03.gateway.stripe",
  manual: "p03.gateway.manual",
};

export const PAY_STATUS: Readonly<
  Record<"pending" | "succeeded" | "failed" | "refunded", { key: ControlMessageKey; tone: Tone }>
> = {
  pending: { key: "p03.payStatus.pending", tone: "info" },
  succeeded: { key: "p03.payStatus.succeeded", tone: "success" },
  failed: { key: "p03.payStatus.failed", tone: "danger" },
  refunded: { key: "p03.payStatus.refunded", tone: "neutral" },
};

export const DUNNING: Readonly<Record<DunningStage, { key: ControlMessageKey; tone: Tone }>> = {
  none: { key: "p03.dunStage.none", tone: "success" },
  reminder_1: { key: "p03.dunStage.reminder1", tone: "warning" },
  reminder_2: { key: "p03.dunStage.reminder2", tone: "warning" },
  final_notice: { key: "p03.dunStage.finalNotice", tone: "danger" },
  read_only: { key: "p03.dunStage.readOnly", tone: "danger" },
};
