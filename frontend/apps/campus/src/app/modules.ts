import type { ModuleId } from "@nexus/contracts";
import type { MessageKey } from "@nexus/i18n";
import { Building2, Languages, Palette, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import type { ComponentType } from "react";

/** Offline level from `docs/MODULES.md`: L0 online only … L3 pre-synced reference data. */
export type OfflineLevel = "L0" | "L1" | "L2" | "L3";

/** One module screen in the campus app; the menu, route and guard are built from it. */
export interface ModuleEntry {
  readonly moduleId: ModuleId;
  /** Route path without a leading slash, e.g. `settings/institution`. */
  readonly path: string;
  readonly navKey: MessageKey;
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
    icon: Building2,
    permission: "m01.institution.manage",
    offlineLevel: "L0",
    load: () => import("../modules/m01/SetupPage"),
  },
  {
    moduleId: "M02",
    path: "access",
    navKey: "m02.nav.title",
    icon: Users,
    permission: "m02.user.read",
    offlineLevel: "L1",
    load: () => import("../modules/m02/AccessPage"),
  },
  {
    moduleId: "M03",
    path: "theme",
    navKey: "m03.nav.title",
    icon: Palette,
    permission: "m03.theme.manage",
    offlineLevel: "L1",
    load: () => import("../modules/m03/ThemeStudioPage"),
  },
  {
    moduleId: "M04",
    path: "texts",
    navKey: "m04.nav.title",
    icon: Languages,
    permission: "m04.text.manage",
    offlineLevel: "L1",
    load: () => import("../modules/m04/TextStudioPage"),
  },
  {
    moduleId: "M06",
    path: "privacy",
    navKey: "m06.nav.title",
    icon: ShieldCheck,
    permission: "m06.audit.read",
    offlineLevel: "L0",
    load: () => import("../modules/m06/PrivacyPage"),
  },
];
