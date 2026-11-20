import { useText } from "@nexus/i18n";
import { Button, useToast } from "@nexus/ui-core";
import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { usePwaUpdate } from "./registerPwa";

/** "New version available" notice with Reload, and a one-time "ready to work offline" toast. */
export function UpdateToast() {
  const t = useText();
  const toast = useToast();
  const pwa = usePwaUpdate();

  useEffect(() => {
    if (!pwa.offlineReady) return;
    toast.show({ tone: "info", title: t("common.pwa.offlineReady") });
    pwa.dismissOfflineReady();
  }, [pwa.offlineReady, pwa, t, toast]);

  if (!pwa.needRefresh) return null;
  return (
    <div
      role="status"
      className="fixed bottom-4 end-4 z-50 flex max-w-sm items-center gap-3 rounded-md border border-border-default border-s-4 border-s-info bg-bg-surface p-4 shadow-lg"
    >
      <p className="flex-1 text-body font-medium text-text-primary">
        {t("common.pwa.updateReady")}
      </p>
      <Button size="sm" onClick={pwa.update}>
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t("common.pwa.reload")}
      </Button>
      <Button size="sm" variant="ghost" onClick={pwa.dismissRefresh}>
        {t("common.pwa.later")}
      </Button>
    </div>
  );
}
