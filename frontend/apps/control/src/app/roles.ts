import type { StaffRole } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";

/** Message key of each staff role's name. */
export const ROLE_KEY: Readonly<Record<StaffRole, ControlMessageKey>> = {
  super_admin: "ctl.role.superAdmin",
  sales: "ctl.role.sales",
  billing: "ctl.role.billing",
  support: "ctl.role.support",
  implementation: "ctl.role.implementation",
  release_manager: "ctl.role.releaseManager",
  sre: "ctl.role.sre",
  security_officer: "ctl.role.securityOfficer",
  partner: "ctl.role.partner",
};
