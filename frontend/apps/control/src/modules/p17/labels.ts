import type { Sandbox } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

type Tone = NonNullable<BadgeProps["tone"]>;

export const KIND_KEY: Readonly<Record<Sandbox["kind"], ControlMessageKey>> = {
  sales_demo: "p17.kind.salesDemo",
  staging_clone: "p17.kind.stagingClone",
};

export const DATA_KEY: Readonly<Record<Sandbox["dataKind"], ControlMessageKey>> = {
  synthetic: "p17.data.synthetic",
  masked: "p17.data.masked",
};

export const SANDBOX_STATUS: Readonly<
  Record<Sandbox["status"], { key: ControlMessageKey; tone: Tone }>
> = {
  creating: { key: "p17.status.creating", tone: "info" },
  ready: { key: "p17.status.ready", tone: "success" },
  expired: { key: "p17.status.expired", tone: "neutral" },
  deleted: { key: "p17.status.deleted", tone: "neutral" },
};
