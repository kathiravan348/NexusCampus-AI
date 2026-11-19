import * as React from "react";
import {
  CircleAlert,
  CircleCheck,
  CloudUpload,
  RefreshCw,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { useText, type Translate } from "@nexus/i18n";
import { cn } from "../../lib/cn";

export type SyncStatusState = "synced" | "pending" | "syncing" | "conflict" | "offline" | "error";

export interface SyncStatusProps {
  state: SyncStatusState;
  pendingCount?: number;
  conflictCount?: number;
  /** Locale-formatted timestamp of the last successful sync (from `@nexus/i18n`). */
  lastSyncedAt?: string | null;
  onClick?: () => void;
  className?: string;
}

const STATE_TONE: Readonly<Record<SyncStatusState, string>> = {
  synced: "bg-success-subtle text-success-text",
  pending: "bg-warning-subtle text-warning-text",
  syncing: "bg-info-subtle text-info-text",
  conflict: "bg-danger-subtle text-danger-text",
  offline: "bg-bg-raised text-text-secondary border border-border-default",
  error: "bg-danger-subtle text-danger-text",
};

function renderStateIcon(state: SyncStatusState): React.ReactElement {
  switch (state) {
    case "synced":
      return <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />;
    case "pending":
      return <CloudUpload className="h-4 w-4 shrink-0" aria-hidden="true" />;
    case "syncing":
      return (
        <RefreshCw
          className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
          aria-hidden="true"
        />
      );
    case "conflict":
      return <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />;
    case "offline":
      return <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />;
    case "error":
      return <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />;
  }
}

function resolveLabel(
  t: Translate,
  state: SyncStatusState,
  pendingCount?: number,
  conflictCount?: number,
): string {
  switch (state) {
    case "synced":
      return t("common.syncSynced");
    case "pending":
      return pendingCount !== undefined && pendingCount > 0
        ? t("common.syncPending", { count: pendingCount })
        : t("common.syncPendingGeneric");
    case "syncing":
      return t("common.syncSyncing");
    case "conflict":
      return conflictCount !== undefined && conflictCount > 0
        ? t("common.syncConflict", { count: conflictCount })
        : t("common.syncConflictGeneric");
    case "offline":
      return pendingCount !== undefined && pendingCount > 0
        ? t("common.syncOfflinePending", { count: pendingCount })
        : t("common.syncOffline");
    case "error":
      return t("common.syncError");
  }
}

export function SyncStatus({
  state,
  pendingCount,
  conflictCount,
  lastSyncedAt,
  onClick,
  className,
}: SyncStatusProps): React.ReactElement {
  const t = useText();
  const label = resolveLabel(t, state, pendingCount, conflictCount);
  const syncedText = lastSyncedAt ? t("common.syncLastSynced", { time: lastSyncedAt }) : null;

  const baseClass = cn(
    "inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-pill px-3 py-1 font-sans text-body-sm font-medium transition-colors max-w-full",
    STATE_TONE[state],
    className,
  );

  const content = (
    <>
      <span className="inline-flex items-center gap-1.5">
        {renderStateIcon(state)}
        <span>{label}</span>
      </span>
      {syncedText && <span className="text-body-sm font-normal">{syncedText}</span>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        data-state={state}
        onClick={onClick}
        className={cn(
          baseClass,
          "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-ground",
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div role="status" aria-live="polite" data-state={state} className={baseClass}>
      {content}
    </div>
  );
}
