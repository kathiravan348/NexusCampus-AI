import type { ChurnRisk } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

type Tone = NonNullable<BadgeProps["tone"]>;

export const RISK: Readonly<
  Record<ChurnRisk, { key: ControlMessageKey; tone: Tone; order: number }>
> = {
  high: { key: "p16.risk.high", tone: "danger", order: 0 },
  medium: { key: "p16.risk.medium", tone: "warning", order: 1 },
  low: { key: "p16.risk.low", tone: "success", order: 2 },
};

/** The reasons the health model may give; anything else shows a neutral fallback. */
const REASONS = [
  "p16.reason.overdueInvoice",
  "p16.reason.steadyUsage",
  "p16.reason.growingUsage",
  "p16.reason.expansionWon",
  "p16.reason.recentIncident",
  "p16.reason.highAiUse",
  "p16.reason.lowUsage",
  "p16.reason.trialEndingSoon",
  "p16.reason.nearLearnerCap",
  "p16.reason.openSlaBreach",
  "p16.reason.noTelemetry",
  "p16.reason.supportRenewalDue",
] as const satisfies readonly ControlMessageKey[];

const KNOWN: ReadonlySet<string> = new Set(REASONS);

export function reasonKey(key: string): ControlMessageKey {
  return KNOWN.has(key) ? (key as ControlMessageKey) : "p16.reason.other";
}
