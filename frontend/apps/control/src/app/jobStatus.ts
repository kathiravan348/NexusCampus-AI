import type { StepStatus } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useMemo } from "react";

/** Badge tone of a job or step status (provisioning, offboarding, tenant moves). */
export const STATUS_TONE = {
  pending: "neutral",
  running: "info",
  done: "success",
  failed: "danger",
} as const satisfies Record<StepStatus, string>;

/** Translated job/step status words for `JobSteps` and badges. */
export function useStepStatusLabels(): Readonly<Record<StepStatus, string>> {
  const t = useControlText();
  return useMemo(
    () => ({
      pending: t("p04.status.pending"),
      running: t("p04.status.running"),
      done: t("p04.status.done"),
      failed: t("p04.status.failed"),
    }),
    [t],
  );
}
