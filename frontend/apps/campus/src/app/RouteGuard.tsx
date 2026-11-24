import { useText } from "@nexus/i18n";
import { useEntitlements, useMe, useSession } from "@nexus/services";
import { EmptyState } from "@nexus/ui-core";
import { WifiOff } from "lucide-react";
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Forbidden } from "../pages/Forbidden";
import { HomeLink } from "../pages/HomeLink";
import { ModuleOff } from "../pages/ModuleOff";
import type { ModuleEntry } from "./modules";

export interface ModuleAccess {
  readonly loading: boolean;
  isEntitled(entry: ModuleEntry): boolean;
  isPermitted(entry: ModuleEntry): boolean;
  /** Shown in the menu: entitled and permitted. */
  isVisible(entry: ModuleEntry): boolean;
}

/** Resolves module access from tenant entitlements, permissions and role profiles. */
export function useModuleAccess(): ModuleAccess {
  const entitlements = useEntitlements();
  const me = useMe();
  const tenantId = useSession().session?.tenantId;
  return useMemo(() => {
    const enabled = new Set(
      (entitlements.data?.items ?? []).filter((e) => e.enabled).map((e) => e.moduleId),
    );
    const permissions = new Set<string>(me.data?.permissions ?? []);
    const profiles = (me.data?.roleProfiles ?? []).filter((p) => p.tenantId === tenantId);
    const kinds = new Set(profiles.map((profile) => profile.kind));
    const activeKinds = new Set(profiles.filter((p) => p.status === "active").map((p) => p.kind));
    const isEntitled = (entry: ModuleEntry) => enabled.has(entry.moduleId);
    const isPermitted = ({ permission, audience }: ModuleEntry) => {
      if (permission !== null && permissions.has(permission)) return true;
      if (!audience) return permission === null;
      if (audience.notLeader && permissions.has("m28.dashboards.read")) return false;
      if (audience.notStaff && kinds.has("staff")) return false;
      if (audience.notGuardian && kinds.has("guardian")) return false;
      return audience.kinds.some((kind) => activeKinds.has(kind));
    };
    return {
      loading: entitlements.isPending || me.isPending,
      isEntitled,
      isPermitted,
      isVisible: (entry) => isEntitled(entry) && isPermitted(entry),
    };
  }, [entitlements.data, entitlements.isPending, me.data, me.isPending, tenantId]);
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
  const { session, ready } = useSession();
  const location = useLocation();
  const t = useText();
  if (!ready) {
    // Real mode asks the backend who is signed in before deciding.
    return (
      <p role="status" className="text-body text-text-secondary">
        {t("common.loading")}
      </p>
    );
  }
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
        action={<HomeLink />}
      />
    );
  }
  return <>{children}</>;
}
