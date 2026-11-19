import { useText } from "@nexus/i18n";
import { useEntitlements, useMe, useSession } from "@nexus/services";
import { EmptyState } from "@nexus/ui-core";
import { WifiOff } from "lucide-react";
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Forbidden } from "../pages/Forbidden";
import { ModuleOff } from "../pages/ModuleOff";
import type { ModuleEntry } from "./modules";

export interface ModuleAccess {
  readonly loading: boolean;
  isEntitled(entry: ModuleEntry): boolean;
  isPermitted(entry: ModuleEntry): boolean;
  /** Shown in the menu: entitled and permitted. */
  isVisible(entry: ModuleEntry): boolean;
}

/** What the signed-in user may open, from the tenant's entitlements and the user's permissions. */
export function useModuleAccess(): ModuleAccess {
  const entitlements = useEntitlements();
  const me = useMe();
  return useMemo(() => {
    const enabled = new Set(
      (entitlements.data?.items ?? []).filter((e) => e.enabled).map((e) => e.moduleId),
    );
    const permissions = new Set<string>(me.data?.permissions ?? []);
    const isEntitled = (entry: ModuleEntry) => enabled.has(entry.moduleId);
    const isPermitted = (entry: ModuleEntry) =>
      entry.permission === null || permissions.has(entry.permission);
    return {
      loading: entitlements.isPending || me.isPending,
      isEntitled,
      isPermitted,
      isVisible: (entry) => isEntitled(entry) && isPermitted(entry),
    };
  }, [entitlements.data, entitlements.isPending, me.data, me.isPending]);
}

function subscribeOnline(notify: () => void): () => void {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
}

export function useOnline(): boolean {
  const read = useCallback(() => navigator.onLine, []);
  return useSyncExternalStore(subscribeOnline, read, () => true);
}

export interface RouteGuardProps {
  /** Without a module: only checks that someone is signed in. */
  readonly module?: ModuleEntry;
  readonly children: ReactNode;
}

/** No session → sign-in; module off → `ModuleOff`; no permission → `Forbidden`; L0 offline → notice. */
export function RouteGuard({ module, children }: RouteGuardProps) {
  const { session } = useSession();
  const location = useLocation();
  if (!session) return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />;
  if (!module) return <>{children}</>;
  return <ModuleGuard module={module}>{children}</ModuleGuard>;
}

function ModuleGuard({
  module,
  children,
}: {
  readonly module: ModuleEntry;
  readonly children: ReactNode;
}) {
  const t = useText();
  const access = useModuleAccess();
  const online = useOnline();
  if (access.loading) {
    return (
      <p role="status" className="text-body text-text-secondary">
        {t("common.loading")}
      </p>
    );
  }
  if (!access.isEntitled(module)) return <ModuleOff />;
  if (!access.isPermitted(module)) return <Forbidden />;
  if (module.offlineLevel === "L0" && !online) {
    return (
      <EmptyState
        icon={<WifiOff className="h-6 w-6" />}
        title={t("common.shell.offlineTitle")}
        description={t("common.shell.offlineBody")}
      />
    );
  }
  return <>{children}</>;
}
