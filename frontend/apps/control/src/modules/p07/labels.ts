import type { ReleaseStatus, Rollout } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

type Tone = NonNullable<BadgeProps["tone"]>;

export const RELEASE_STATUS: Readonly<
  Record<ReleaseStatus, { key: ControlMessageKey; tone: Tone }>
> = {
  draft: { key: "p07.status.draft", tone: "neutral" },
  published: { key: "p07.status.published", tone: "success" },
  withdrawn: { key: "p07.status.withdrawn", tone: "danger" },
};

export const ROLLOUT_STATUS: Readonly<
  Record<Rollout["status"], { key: ControlMessageKey; tone: Tone }>
> = {
  pending: { key: "p07.rolloutStatus.pending", tone: "neutral" },
  running: { key: "p07.rolloutStatus.running", tone: "info" },
  done: { key: "p07.rolloutStatus.done", tone: "success" },
  failed: { key: "p07.rolloutStatus.failed", tone: "danger" },
  rolled_back: { key: "p07.rolloutStatus.rolledBack", tone: "warning" },
};
