import type { OffboardingStepName, ProvisioningStepName, StepStatus } from "@nexus/contracts";
import { useControlText, type ControlMessageKey } from "@nexus/i18n/control";
import { useMemo } from "react";

export const PROVISIONING_STEP_KEY: Readonly<Record<ProvisioningStepName, ControlMessageKey>> = {
  create_tenant: "p04.step.createTenant",
  create_keys: "p04.step.createKeys",
  apply_profile: "p04.step.applyProfile",
  seed: "p04.step.seed",
  invite_owner: "p04.step.inviteOwner",
};

export const OFFBOARDING_STEP_KEY: Readonly<Record<OffboardingStepName, ControlMessageKey>> = {
  freeze_writes: "p04.off.freeze",
  export_ready: "p04.off.exportReady",
  export_downloaded: "p04.off.exportDownloaded",
  keys_destroyed: "p04.off.keysDestroyed",
  certificate_issued: "p04.off.certificate",
};

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
