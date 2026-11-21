import type { LicenceEdition, LicenceState } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { BadgeProps } from "@nexus/ui-core";

export const EDITION_KEY: Readonly<Record<LicenceEdition, ControlMessageKey>> = {
  standard: "p05.edition.standard",
  enterprise: "p05.edition.enterprise",
};

export const STATE: Readonly<
  Record<LicenceState, { key: ControlMessageKey; tone: NonNullable<BadgeProps["tone"]> }>
> = {
  active: { key: "p05.state.active", tone: "success" },
  grace: { key: "p05.state.grace", tone: "warning" },
  read_only: { key: "p05.state.readOnly", tone: "danger" },
  expired: { key: "p05.state.expired", tone: "danger" },
  revoked: { key: "p05.state.revoked", tone: "neutral" },
};
