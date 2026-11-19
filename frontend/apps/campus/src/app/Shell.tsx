import { useText } from "@nexus/i18n";
import { DATA_MODE } from "@nexus/services";
import { AppShell, DemoBanner, NavItem } from "@nexus/ui-core";
import { House } from "lucide-react";
import { Link, Outlet, useLocation, useOutletContext } from "react-router";
import { LocaleSwitch } from "./LocaleSwitch";
import type { ModuleEntry } from "./modules";
import { PlatformMark } from "./PlatformMark";
import { useModuleAccess } from "./RouteGuard";
import { ShellBrand, ShellHeader } from "./ShellHeader";
import { useRuntime } from "./TenantRuntime";

export interface ShellOutletContext {
  /** Modules this user may open (entitled + permitted), in menu order. */
  readonly visibleModules: readonly ModuleEntry[];
}

export function useShellContext(): ShellOutletContext {
  return useOutletContext<ShellOutletContext>();
}

function isActive(pathname: string, path: string): boolean {
  const target = `/${path}`;
  return pathname === target || pathname.startsWith(`${target}/`);
}

/** The signed-in layout: menu of the modules this user may open, header actions, page outlet. */
export function Shell({ modules }: { readonly modules: readonly ModuleEntry[] }) {
  const t = useText();
  const { pathname } = useLocation();
  const { tenantName } = useRuntime();
  const access = useModuleAccess();
  const visibleModules = modules.filter((m) => access.isVisible(m));

  return (
    <AppShell
      brand={<ShellBrand />}
      title={
        <span className="flex min-w-0 items-center gap-2">
          {/* Below md the header is crowded; the institution name keeps the space. */}
          <span className="hidden md:inline-flex">
            <PlatformMark size="sm" />
          </span>
          <span className="truncate">{tenantName}</span>
        </span>
      }
      banner={DATA_MODE === "mock" ? <DemoBanner /> : undefined}
      actions={<ShellHeader />}
      navFooter={<LocaleSwitch />}
      nav={
        <>
          <NavItem asChild active={pathname === "/"} icon={<House className="h-4 w-4" />}>
            <Link to="/">{t("common.shell.home")}</Link>
          </NavItem>
          {visibleModules.map((m) => {
            const Icon = m.icon;
            return (
              <NavItem
                key={m.moduleId + m.path}
                asChild
                active={isActive(pathname, m.path)}
                icon={<Icon className="h-4 w-4" />}
              >
                <Link to={`/${m.path}`}>{t(m.navKey)}</Link>
              </NavItem>
            );
          })}
        </>
      }
    >
      <Outlet context={{ visibleModules } satisfies ShellOutletContext} />
    </AppShell>
  );
}
