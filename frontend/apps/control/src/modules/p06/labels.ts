import type { DeploymentHealth, DeploymentKind, ReleaseChannel } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

export const KIND_KEY: Readonly<Record<DeploymentKind, ControlMessageKey>> = {
  saas_shared_cell: "p06.kind.saasSharedCell",
  saas_dedicated_cell: "p06.kind.saasDedicatedCell",
  self_hosted: "p06.kind.selfHosted",
  edge: "p06.kind.edge",
};

export const CHANNEL_KEY: Readonly<Record<ReleaseChannel, ControlMessageKey>> = {
  stable: "p06.channel.stable",
  lts: "p06.channel.lts",
  preview: "p06.channel.preview",
};

export const HEALTH: Readonly<
  Record<DeploymentHealth, { key: ControlMessageKey; tone: NonNullable<BadgeProps["tone"]> }>
> = {
  healthy: { key: "p06.health.healthy", tone: "success" },
  degraded: { key: "p06.health.degraded", tone: "warning" },
  down: { key: "p06.health.down", tone: "danger" },
  unknown: { key: "p06.health.unknown", tone: "neutral" },
};

export const HEALTH_ORDER: readonly DeploymentHealth[] = ["healthy", "degraded", "down", "unknown"];
