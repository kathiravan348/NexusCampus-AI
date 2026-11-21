import type { BrokerRequestStatus, ModuleId } from "@nexus/contracts";
import type { MessageKey } from "@nexus/i18n";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

export const REQUEST_STATUS: Readonly<
  Record<BrokerRequestStatus, { key: ControlMessageKey; tone: NonNullable<BadgeProps["tone"]> }>
> = {
  pending: { key: "p10.status.pending", tone: "info" },
  approved: { key: "p10.status.approved", tone: "success" },
  denied: { key: "p10.status.denied", tone: "danger" },
  expired: { key: "p10.status.expired", tone: "neutral" },
  revoked: { key: "p10.status.revoked", tone: "warning" },
  ended: { key: "p10.status.ended", tone: "neutral" },
};

/** Stage 1 modules support may ask for. The data vault (M83) is never in scope (V-2). */
export const REQUESTABLE_MODULES: readonly ModuleId[] = [
  "M01",
  "M02",
  "M03",
  "M04",
  "M05",
  "M06",
  "M07",
  "M10",
  "M11",
];

/** Module names from the platform catalogue (shared with the institution app). */
export const MODULE_NAME_KEY: Readonly<Record<string, MessageKey>> = {
  M01: "m05.module.m01",
  M02: "m05.module.m02",
  M03: "m05.module.m03",
  M04: "m05.module.m04",
  M05: "m05.module.m05",
  M06: "m05.module.m06",
  M07: "m05.module.m07",
  M10: "m05.module.m10",
  M11: "m05.module.m11",
  M83: "m05.module.m83",
};
