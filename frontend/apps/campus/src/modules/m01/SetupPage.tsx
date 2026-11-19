import { getDirection, useText } from "@nexus/i18n";
import { useTenant } from "@nexus/services";
import { Button, EmptyState, Select, Skeleton, Tabs } from "@nexus/ui-core";
import { Building2, WifiOff } from "lucide-react";
import { useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { CalendarTab } from "./CalendarTab";
import { LocaleTab } from "./LocaleTab";
import { ProfileTab } from "./ProfileTab";
import { StructureTab } from "./StructureTab";

/** Institution setup (M01, L0): Profile · Structure · Locale & formats · Calendar. */
export function SetupPage() {
  const t = useText();
  const { locale } = useRuntime();
  const online = useOnline();
  const tenant = useTenant();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  if (tenant.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-96 max-w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (tenant.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m01.setup.error")}
        action={
          <Button variant="secondary" onClick={() => void tenant.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const institutions = tenant.data.institutions;
  const institution = institutions.find((i) => i.id === selectedId) ?? institutions[0] ?? null;

  if (!institution) {
    return <EmptyState icon={<Building2 className="h-6 w-6" />} title={t("m01.setup.empty")} />;
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-sans text-page-title font-semibold text-text-primary">
            {t("m01.nav.title")}
          </h1>
          <p className="text-body text-text-secondary">{t("m01.setup.intro")}</p>
        </div>
        {institutions.length > 1 && (
          <Select
            label={t("m01.setup.institutionLabel")}
            options={institutions.map((i) => ({ value: i.id, label: i.name }))}
            value={institution.id}
            onChange={(event) => setSelectedId(event.target.value)}
            containerClassName="w-full sm:w-64"
          />
        )}
      </header>

      {!online && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-border-default bg-warning-subtle px-4 py-3 text-body-sm font-medium text-warning-text"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("m01.setup.offlineNotice")}</span>
        </div>
      )}

      <Tabs
        ariaLabel={t("m01.setup.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue="profile"
        items={[
          {
            value: "profile",
            label: t("m01.setup.tabProfile"),
            content: <ProfileTab institution={institution} />,
          },
          {
            value: "structure",
            label: t("m01.setup.tabStructure"),
            content: <StructureTab tenant={tenant.data} online={online} />,
          },
          {
            value: "locale",
            label: t("m01.setup.tabLocale"),
            content: <LocaleTab institution={institution} online={online} />,
          },
          {
            value: "calendar",
            label: t("m01.setup.tabCalendar"),
            content: <CalendarTab institution={institution} online={online} />,
          },
        ]}
      />
    </div>
  );
}

export default SetupPage;
