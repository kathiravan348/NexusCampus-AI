import { getDirection, useText } from "@nexus/i18n";
import { useMe } from "@nexus/services";
import { Tabs } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";
import { ConflictsTab } from "./ConflictsTab";
import { DevicesTab } from "./DevicesTab";
import { ThisDeviceTab } from "./ThisDeviceTab";

/**
 * Sync centre (M10, L3): This device for everyone (works offline); Devices and Conflicts for users
 * with `m10.device.read`. Permissions come from the cached `me` (L1), so offline still knows them.
 */
export function SyncCentrePage() {
  const t = useText();
  const { locale } = useRuntime();
  const me = useMe();
  const can = new Set(me.data?.permissions ?? []);
  const canRead = can.has("m10.device.read");
  const canWipe = can.has("m10.device.wipe");

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m10.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m10.sync.intro")}</p>
      </header>
      <Tabs
        ariaLabel={t("m10.sync.tabsLabel")}
        dir={getDirection(locale)}
        defaultValue="device"
        items={[
          { value: "device", label: t("m10.sync.tabDevice"), content: <ThisDeviceTab /> },
          ...(canRead
            ? [
                {
                  value: "devices",
                  label: t("m10.sync.tabDevices"),
                  content: <DevicesTab canWipe={canWipe} />,
                },
                {
                  value: "conflicts",
                  label: t("m10.sync.tabConflicts"),
                  content: <ConflictsTab canResolve={canWipe} />,
                },
              ]
            : []),
        ]}
      />
    </div>
  );
}

export default SyncCentrePage;
