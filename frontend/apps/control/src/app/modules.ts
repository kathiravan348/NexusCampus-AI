import type { ControlPermission, ModuleId } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import { Building2, KeyRound, Receipt, ServerCog, Tags, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

/** One Nexus Control page (P01–P18); the menu, home tile, route and guard are built from it. */
export interface ControlModuleEntry {
  readonly moduleId: ModuleId;
  /** Route path without a leading slash, e.g. `accounts`. */
  readonly path: string;
  readonly navKey: ControlMessageKey;
  readonly summaryKey: ControlMessageKey;
  readonly icon: LucideIcon;
  /** Needed to see and open it (deny by default). */
  readonly permission: ControlPermission;
  readonly load: () => Promise<{ readonly default: ComponentType }>;
}

/**
 * Every Control page, one line per screen task (shared list file, `AGENTS.md` §3). Keep entries in module order.
 */
export const CONTROL_MODULES: readonly ControlModuleEntry[] = [
  {
    moduleId: "P01",
    path: "accounts",
    navKey: "p01.nav",
    summaryKey: "p01.summary",
    icon: Building2,
    permission: "ctl.account.read",
    load: () => import("../modules/p01/AccountsPage"),
  },
  {
    moduleId: "P02",
    path: "pricing",
    navKey: "p02.nav",
    summaryKey: "p02.summary",
    icon: Tags,
    permission: "ctl.quote.read",
    load: () => import("../modules/p02/PricingPage"),
  },
  {
    moduleId: "P03",
    path: "billing",
    navKey: "p03.nav",
    summaryKey: "p03.summary",
    icon: Receipt,
    permission: "ctl.billing.read",
    load: () => import("../modules/p03/BillingPage"),
  },
  {
    moduleId: "P04",
    path: "provisioning",
    navKey: "p04.nav",
    summaryKey: "p04.summary",
    icon: ServerCog,
    permission: "ctl.provisioning.read",
    load: () => import("../modules/p04/ProvisioningPage"),
  },
  {
    moduleId: "P05",
    path: "licences",
    navKey: "p05.nav",
    summaryKey: "p05.summary",
    icon: KeyRound,
    permission: "ctl.licence.read",
    load: () => import("../modules/p05/LicencesPage"),
  },
];
