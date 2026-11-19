import { formatDateTime, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { useSyncStatus } from "@nexus/offline";
import { DATA_MODE, useSession } from "@nexus/services";
import { IconButton, SyncStatus, useToast } from "@nexus/ui-core";
import { LogOut, Moon, Sun } from "lucide-react";
import { useNavigate } from "react-router";
import { PersonaSwitch } from "./PersonaSwitch";
import { useRuntime } from "./TenantRuntime";

/** Tenant logo and name for the sidebar and drawer. */
export function ShellBrand() {
  const { tenantName, logoUrl } = useRuntime();
  return (
    <div className="flex min-w-0 items-center gap-2">
      {logoUrl && (
        <img
          key={logoUrl}
          src={logoUrl}
          alt=""
          className="h-7 w-7 shrink-0 rounded-xs object-contain"
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />
      )}
      <span className="truncate font-sans text-card-title font-semibold text-text-primary">
        {tenantName}
      </span>
    </div>
  );
}

/** Header actions: sync status, light/dark, persona switch and sign-out (icon buttons fit 360px). */
export function ShellHeader() {
  const t = useText();
  const { session, db, signOut } = useSession();
  const { locale, timeZone, mode, setMode } = useRuntime();
  const sync = useSyncStatus(db, session);
  const toast = useToast();
  const navigate = useNavigate();
  const dark = mode === "dark";
  const formattedLastSyncedAt = sync.lastSyncedAt
    ? formatDateTime(sync.lastSyncedAt, {
        locale: isPseudoLocale(locale) ? SOURCE_LOCALE : locale,
        timeZone,
      })
    : null;

  return (
    <>
      <SyncStatus
        state={sync.state}
        pendingCount={sync.pendingCount}
        conflictCount={sync.conflictCount}
        lastSyncedAt={formattedLastSyncedAt}
      />
      <IconButton
        icon={dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        aria-label={t(dark ? "common.shell.themeLight" : "common.shell.themeDark")}
        variant="ghost"
        size="sm"
        onClick={() => setMode(dark ? "light" : "dark")}
      />
      {DATA_MODE === "mock" && <PersonaSwitch />}
      <IconButton
        icon={<LogOut className="h-4 w-4 rtl:-scale-x-100" />}
        aria-label={t("common.shell.signOut")}
        variant="ghost"
        size="sm"
        onClick={() => {
          void signOut().then((result) => {
            if (result.blocked) {
              toast.show({
                tone: "danger",
                title: t("common.shell.signOutBlocked", { count: result.pending }),
              });
            } else {
              navigate("/sign-in", { replace: true });
            }
          });
        }}
      />
    </>
  );
}
