import type { ControlPermission, ModuleId } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import {
  BarChart3,
  Building2,
  ClipboardList,
  Gauge,
  Handshake,
  KeyRound,
  LifeBuoy,
  Network,
  Puzzle,
  Receipt,
  Rocket,
  Scale,
  ServerCog,
  ShieldCheck,
  Tags,
  UserCog,
  type LucideIcon,
} from "lucide-react";
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
  {
    moduleId: "P06",
    path: "fleet",
    navKey: "p06.nav",
    summaryKey: "p06.summary",
    icon: Network,
    permission: "ctl.fleet.read",
    load: () => import("../modules/p06/FleetPage"),
  },
  {
    moduleId: "P07",
    path: "releases",
    navKey: "p07.nav",
    summaryKey: "p07.summary",
    icon: Rocket,
    permission: "ctl.release.read",
    load: () => import("../modules/p07/ReleasesPage"),
  },
  {
    moduleId: "P08",
    path: "extensions",
    navKey: "p08.nav",
    summaryKey: "p08.summary",
    icon: Puzzle,
    permission: "ctl.extension.read",
    load: () => import("../modules/p08/ExtensionsPage"),
  },
  {
    moduleId: "P09",
    path: "support",
    navKey: "p09.nav",
    summaryKey: "p09.summary",
    icon: LifeBuoy,
    permission: "ctl.ticket.read",
    load: () => import("../modules/p09/SupportPage"),
  },
  {
    moduleId: "P10",
    path: "access",
    navKey: "p10.nav",
    summaryKey: "p10.summary",
    icon: ShieldCheck,
    permission: "ctl.broker.read",
    load: () => import("../modules/p10/AccessPage"),
  },
  {
    moduleId: "P11",
    path: "usage",
    navKey: "p11.nav",
    summaryKey: "p11.summary",
    icon: Gauge,
    permission: "ctl.usage.read",
    load: () => import("../modules/p11/UsagePage"),
  },
  {
    moduleId: "P12",
    path: "partners",
    navKey: "p12.nav",
    summaryKey: "p12.summary",
    icon: Handshake,
    permission: "ctl.deal.read",
    load: () => import("../modules/p12/PartnersPage"),
  },
  {
    moduleId: "P13",
    path: "staff",
    navKey: "p13.nav",
    summaryKey: "p13.summary",
    icon: UserCog,
    permission: "ctl.staff.read",
    load: () => import("../modules/p13/StaffPage"),
  },
  {
    moduleId: "P14",
    path: "trust",
    navKey: "p14.nav",
    summaryKey: "p14.summary",
    icon: Scale,
    permission: "ctl.trust.read",
    load: () => import("../modules/p14/TrustPage"),
  },
  {
    moduleId: "P15",
    path: "projects",
    navKey: "p15.nav",
    summaryKey: "p15.summary",
    icon: ClipboardList,
    permission: "ctl.project.read",
    load: () => import("../modules/p15/ProjectsPage"),
  },
  {
    moduleId: "P16",
    path: "analytics",
    navKey: "p16.nav",
    summaryKey: "p16.summary",
    icon: BarChart3,
    permission: "ctl.analytics.read",
    load: () => import("../modules/p16/AnalyticsPage"),
  },
];
