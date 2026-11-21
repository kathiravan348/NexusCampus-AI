import type { ImplementationProject, ProjectKind } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

type Tone = NonNullable<BadgeProps["tone"]>;

export const KIND_KEY: Readonly<Record<ProjectKind, ControlMessageKey>> = {
  onboarding: "p15.kind.onboarding",
  migration: "p15.kind.migration",
  self_hosted_install: "p15.kind.selfHostedInstall",
  training: "p15.kind.training",
};

export const PROJECT_STATUS: Readonly<
  Record<ImplementationProject["status"], { key: ControlMessageKey; tone: Tone }>
> = {
  planned: { key: "p15.status.planned", tone: "neutral" },
  in_progress: { key: "p15.status.inProgress", tone: "info" },
  live: { key: "p15.status.live", tone: "success" },
  on_hold: { key: "p15.status.onHold", tone: "warning" },
};
