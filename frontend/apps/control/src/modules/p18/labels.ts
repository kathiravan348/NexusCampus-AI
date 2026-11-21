import type { PortabilityDirection, PortabilityStepName } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";

export const DIRECTION_KEY: Readonly<Record<PortabilityDirection, ControlMessageKey>> = {
  saas_to_self_hosted: "p18.dir.toSelfHosted",
  self_hosted_to_saas: "p18.dir.toSaas",
  region_move: "p18.dir.region",
};

export const MOVE_STEP_KEY: Readonly<Record<PortabilityStepName, ControlMessageKey>> = {
  preflight: "p18.step.preflight",
  export_encrypted: "p18.step.export",
  transfer: "p18.step.transfer",
  import: "p18.step.import",
  verify: "p18.step.verify",
  cutover: "p18.step.cutover",
  shred_source: "p18.step.shred",
};
