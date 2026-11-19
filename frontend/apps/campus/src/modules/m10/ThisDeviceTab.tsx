import { useText } from "@nexus/i18n";
import { useSyncStatus, type OutboxTransport } from "@nexus/offline";
import {
  useLocalOutbox,
  useResolveLocalConflict,
  useServices,
  useSession,
  useSyncNow,
} from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton, SyncStatus, useToast } from "@nexus/ui-core";
import { CloudCheck, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { OUTBOX_STATUS_KEY, OUTBOX_TONE, PRIORITY_KEY, when } from "./syncShared";

export interface ThisDeviceTabProps {
  /** Injected in tests; defaults to the screens' mounted mutation senders. */
  readonly transport?: OutboxTransport;
}

/** This device: sync state, the local outbox (never payloads), Sync now, local conflict choices. Works offline. */
export function ThisDeviceTab({ transport }: ThisDeviceTabProps) {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const online = useOnline();
  const { db } = useServices();
  const { session } = useSession();
  const sync = useSyncStatus(db, session);
  const outbox = useLocalOutbox();
  const syncNow = useSyncNow(transport);
  const resolveLocal = useResolveLocalConflict();
  const [busy, setBusy] = useState(false);

  const onSync = async () => {
    setBusy(true);
    try {
      const summary = await syncNow();
      toast.show({
        tone: summary && summary.failed + summary.conflicted > 0 ? "warning" : "success",
        title: t("m10.device.synced", { sent: summary?.sent ?? 0 }),
      });
    } catch {
      toast.show({ tone: "danger", title: t("m10.sync.failed") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card title={t("m10.device.title")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SyncStatus
            state={sync.state}
            pendingCount={sync.pendingCount}
            conflictCount={sync.conflictCount}
            lastSyncedAt={sync.lastSyncedAt ? when(sync.lastSyncedAt, locale, timeZone) : null}
          />
          <Button
            onClick={() => void onSync()}
            loading={busy}
            disabled={!online || outbox.entries.length === 0}
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            {t("m10.device.syncNow")}
          </Button>
        </div>
        {!online && (
          <p className="mt-3 text-body-sm text-text-muted">{t("m10.device.offlineHint")}</p>
        )}
      </Card>

      <section className="space-y-3" aria-labelledby="outbox-heading">
        <h2 id="outbox-heading" className="text-card-title font-semibold text-text-primary">
          {t("m10.outbox.title")}
        </h2>
        <p className="text-body-sm text-text-muted">{t("m10.outbox.privacy")}</p>
        {outbox.loading ? (
          <Skeleton className="h-24 w-full" />
        ) : outbox.entries.length === 0 ? (
          <EmptyState icon={<CloudCheck className="h-6 w-6" />} title={t("m10.outbox.empty")} />
        ) : (
          <ul className="space-y-2" aria-label={t("m10.outbox.title")}>
            {outbox.entries.map((e) => (
              <li
                key={e.id}
                className="space-y-2 rounded-lg border border-border-default bg-bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-body-sm text-text-primary">
                    {e.moduleId} · {e.operation}
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <Badge tone="neutral">{t(PRIORITY_KEY[e.priority])}</Badge>
                    <Badge tone={OUTBOX_TONE[e.status]}>{t(OUTBOX_STATUS_KEY[e.status])}</Badge>
                  </span>
                </div>
                <p className="font-mono text-number-sm tabular-nums text-text-secondary">
                  {t("m10.outbox.meta", {
                    attempts: e.attempts,
                    created: when(e.createdAt, locale, timeZone),
                  })}
                </p>
                {e.status === "conflict" && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void resolveLocal(e.id, "retry-local")}
                    >
                      {t("m10.outbox.keepMine")}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void resolveLocal(e.id, "keep-server")}
                    >
                      {t("m10.outbox.keepServer")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
