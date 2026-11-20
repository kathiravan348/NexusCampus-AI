import type { ModuleId } from "@nexus/contracts";
import type { MessageKey } from "@nexus/i18n";
import {
  Bell,
  Building2,
  Gauge,
  KeyRound,
  Languages,
  Palette,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { ComponentType } from "react";

/** Offline level from `docs/MODULES.md`: L0 online only … L3 pre-synced reference data. */
export type OfflineLevel = "L0" | "L1" | "L2" | "L3";

/** One module screen in the campus app; the menu, route and guard are built from it. */
export interface ModuleEntry {
  readonly moduleId: ModuleId;
  /** Route path without a leading slash, e.g. `settings/institution`. */
  readonly path: string;
  readonly navKey: MessageKey;
  /** One-line description on the home tile. */
  readonly summaryKey: MessageKey;
  readonly icon: LucideIcon;
  /** Permission needed to open it; `null` = every user of an entitled tenant. */
  readonly permission: string | null;
  readonly offlineLevel: OfflineLevel;
  /** Assist (M11) never reads this module's data (e.g. M61, M83). */
  readonly aiBlocked?: boolean;
  readonly load: () => Promise<{ readonly default: ComponentType }>;
}

/**
 * Every module screen, one line per screen task (shared list file, `AGENTS.md` §3).
 * Keep entries in module order.
 */
export const MODULES: readonly ModuleEntry[] = [
  {
    moduleId: "M01",
    path: "setup",
    navKey: "m01.nav.title",
    summaryKey: "m01.nav.summary",
    icon: Building2,
    permission: "m01.institution.manage",
    offlineLevel: "L0",
    load: () => import("../modules/m01/SetupPage"),
  },
  {
    moduleId: "M02",
    path: "access",
    navKey: "m02.nav.title",
    summaryKey: "m02.nav.summary",
    icon: Users,
    permission: "m02.user.read",
    offlineLevel: "L1",
    load: () => import("../modules/m02/AccessPage"),
  },
  {
    moduleId: "M03",
    path: "theme",
    navKey: "m03.nav.title",
    summaryKey: "m03.nav.summary",
    icon: Palette,
    permission: "m03.theme.manage",
    offlineLevel: "L1",
    load: () => import("../modules/m03/ThemeStudioPage"),
  },
  {
    moduleId: "M04",
    path: "texts",
    navKey: "m04.nav.title",
    summaryKey: "m04.nav.summary",
    icon: Languages,
    permission: "m04.text.manage",
    offlineLevel: "L1",
    load: () => import("../modules/m04/TextStudioPage"),
  },
  {
    moduleId: "M05",
    path: "plan",
    navKey: "m05.nav.title",
    summaryKey: "m05.nav.summary",
    icon: Gauge,
    permission: "m05.plan.read",
    offlineLevel: "L0",
    load: () => import("../modules/m05/PlanPage"),
  },
  {
    moduleId: "M06",
    path: "privacy",
    navKey: "m06.nav.title",
    summaryKey: "m06.nav.summary",
    icon: ShieldCheck,
    permission: "m06.audit.read",
    offlineLevel: "L0",
    load: () => import("../modules/m06/PrivacyPage"),
  },
  {
    moduleId: "M07",
    path: "notifications",
    navKey: "m07.nav.title",
    summaryKey: "m07.nav.summary",
    icon: Bell,
    permission: "m07.preference.manage",
    offlineLevel: "L1",
    load: () => import("../modules/m07/NotificationsPage"),
  },
  {
    moduleId: "M10",
    path: "sync",
    navKey: "m10.nav.title",
    summaryKey: "m10.nav.summary",
    icon: RefreshCw,
    permission: null,
    offlineLevel: "L3",
    load: () => import("../modules/m10/SyncCentrePage"),
  },
  {
    moduleId: "M11",
    path: "ai",
    navKey: "m11.nav.title",
    summaryKey: "m11.nav.summary",
    icon: Sparkles,
    permission: "m11.settings.manage",
    offlineLevel: "L0",
    load: () => import("../modules/m11/AiSettingsPage"),
  },
  {
    moduleId: "M83",
    path: "vault",
    navKey: "m83.nav.title",
    summaryKey: "m83.nav.summary",
    icon: KeyRound,
    permission: "m83.vault.read",
    offlineLevel: "L0",
    aiBlocked: true,
    load: () => import("../modules/m83/VaultPage"),
  },
];
