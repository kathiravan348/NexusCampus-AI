import type { CompatibilityResult } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

export const RESULT: Readonly<
  Record<CompatibilityResult, { key: ControlMessageKey; tone: NonNullable<BadgeProps["tone"]> }>
> = {
  compatible: { key: "p08.result.compatible", tone: "success" },
  warning: { key: "p08.result.warning", tone: "warning" },
  incompatible: { key: "p08.result.incompatible", tone: "danger" },
};
