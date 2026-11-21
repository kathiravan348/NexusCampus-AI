import { brand } from "@nexus/brand";
import { isPseudoLocale, SOURCE_LOCALE } from "@nexus/i18n";
import { useControlText } from "@nexus/i18n/control";
import { DATA_MODE } from "@nexus/services";
import { useControlServices, useStaffCan, useStaffSession } from "@nexus/services/control";
import { AppShell, DemoBanner, IconButton, NavItem, Select } from "@nexus/ui-core";
import { House, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { useMemo } from "react";
import { Link, Outlet, useLocation, useNavigate, useOutletContext } from "react-router";
import { CONTROL_LOCALES, useControlRuntime } from "./ControlRuntime";
import type { ControlModuleEntry } from "./modules";
import { ROLE_KEY } from "./roles";
import { StaffSwitch } from "./StaffSwitch";

export interface ControlShellContext {
  /** Pages this staff member may open, in menu order. */
  readonly visibleModules: readonly ControlModuleEntry[];
}

export function useControlShell(): ControlShellContext {
  return useOutletContext<ControlShellContext>();
}

function localeName(code: string, display: string): string {
  try {
    return (
      new Intl.DisplayNames([isPseudoLocale(display) ? SOURCE_LOCALE : display], {
        type: "language",
      }).of(code) ?? code
    );
  } catch {
    return code;
  }
}

function LocaleSwitch() {
  const t = useControlText();
  const { locale, setLocale } = useControlRuntime();
  const options = useMemo(
    () => CONTROL_LOCALES.map((code) => ({ value: code, label: localeName(code, locale) })),
    [locale],
  );
  return (
    <Select
      label={t("m04.localeSwitch.label")}
      options={options}
      value={locale}
      onChange={(event) => setLocale(event.target.value)}
    />
  );
}

function Brand() {
  return (
    <span className="flex min-w-0 items-center gap-2">
      <img src={brand.logo.mark} alt="" className="h-7 w-7 shrink-0" />
      <span className="truncate font-sans text-card-title font-semibold text-text-primary">
        {brand.products.control.name}
      </span>
    </span>
  );
}

/** Signed-in layout: menu of permitted pages, staff name + roles, theme, staff switch (demo), sign out. */
export function Shell({ modules }: { readonly modules: readonly ControlModuleEntry[] }) {
  const t = useControlText();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { signOut } = useControlServices();
  const { mode, setMode } = useControlRuntime();
  const session = useStaffSession();
  const can = useStaffCan();
  const visibleModules = modules.filter((m) => can(m.permission));
  const staff = session.data?.staff;
  const dark = mode === "dark";

  return (
    <AppShell
      brand={<Brand />}
      title={
        staff && (
          <span className="flex min-w-0 items-center gap-2">
            <ShieldCheck
              className="h-4 w-4 shrink-0 text-success"
              role="img"
              aria-label={t("ctl.shell.mfaVerified")}
            />
            <span className="min-w-0">
              <span className="block truncate text-body font-medium">{staff.displayName}</span>
              <span className="block truncate text-body-sm text-text-secondary">
                {t("ctl.shell.rolesLabel", {
                  roles: staff.roles.map((r) => t(ROLE_KEY[r])).join(", "),
                })}
              </span>
            </span>
          </span>
        )
      }
      banner={DATA_MODE === "mock" ? <DemoBanner /> : undefined}
      navFooter={<LocaleSwitch />}
      actions={
        <>
          <IconButton
            icon={dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            aria-label={t(dark ? "common.shell.themeLight" : "common.shell.themeDark")}
            variant="ghost"
            size="sm"
            onClick={() => setMode(dark ? "light" : "dark")}
          />
          {DATA_MODE === "mock" && <StaffSwitch />}
          <IconButton
            icon={<LogOut className="h-4 w-4 rtl:-scale-x-100" />}
            aria-label={t("common.shell.signOut")}
            variant="ghost"
            size="sm"
            onClick={() => {
              signOut();
              navigate("/sign-in", { replace: true });
            }}
          />
        </>
      }
      nav={
        <>
          <NavItem asChild active={pathname === "/"} icon={<House className="h-4 w-4" />}>
            <Link to="/">{t("common.shell.home")}</Link>
          </NavItem>
          {visibleModules.map((m) => {
            const Icon = m.icon;
            const target = `/${m.path}`;
            return (
              <NavItem
                key={m.path}
                asChild
                active={pathname === target || pathname.startsWith(`${target}/`)}
                icon={<Icon className="h-4 w-4" />}
              >
                <Link to={target}>{t(m.navKey)}</Link>
              </NavItem>
            );
          })}
        </>
      }
    >
      <Outlet context={{ visibleModules } satisfies ControlShellContext} />
    </AppShell>
  );
}
