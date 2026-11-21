import type { ControlPermission, ModuleId } from "@nexus/contracts";
import type { ControlMessageKey } from "@nexus/i18n/control";
import type { LucideIcon } from "lucide-react";
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
export const CONTROL_MODULES: readonly ControlModuleEntry[] = [];
