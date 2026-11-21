import type { Certification, CertificationCode, SecurityIncident } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

type Tone = NonNullable<BadgeProps["tone"]>;

export const CERT_KEY: Readonly<Record<CertificationCode, ControlMessageKey>> = {
  iso27001: "p14.cert.iso27001",
  iso27701: "p14.cert.iso27701",
  soc2: "p14.cert.soc2",
  cert_in: "p14.cert.certIn",
};

export const CERT_STATUS: Readonly<
  Record<Certification["status"], { key: ControlMessageKey; tone: Tone }>
> = {
  planned: { key: "p14.certStatus.planned", tone: "neutral" },
  in_audit: { key: "p14.certStatus.inAudit", tone: "info" },
  certified: { key: "p14.certStatus.certified", tone: "success" },
  lapsed: { key: "p14.certStatus.lapsed", tone: "danger" },
};

export const SEVERITY: Readonly<
  Record<SecurityIncident["severity"], { key: ControlMessageKey; tone: Tone }>
> = {
  sev1: { key: "p14.sev.sev1", tone: "danger" },
  sev2: { key: "p14.sev.sev2", tone: "warning" },
  sev3: { key: "p14.sev.sev3", tone: "info" },
  sev4: { key: "p14.sev.sev4", tone: "neutral" },
};

export const INCIDENT_STATUS: Readonly<Record<SecurityIncident["status"], ControlMessageKey>> = {
  investigating: "p14.incStatus.investigating",
  contained: "p14.incStatus.contained",
  resolved: "p14.incStatus.resolved",
  post_mortem_done: "p14.incStatus.postMortemDone",
};
