import type { OffboardingStepName, ProvisioningStepName } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";

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

export { STATUS_TONE, useStepStatusLabels } from "../../app/jobStatus";
