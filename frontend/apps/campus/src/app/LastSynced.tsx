import { formatDateTime, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { useRuntime } from "./TenantRuntime";

export interface LastSyncedProps {
  /** TanStack Query `dataUpdatedAt` of the screen's main data (ms since epoch; 0 = never fetched). */
  readonly updatedAt: number;
}

/**
 * "Last synced {time}" under an L1 screen's heading (O-1, ARCHITECTURE §5), so offline readers know how old the
 * cached data is. Plain text, not a live region: refetches are not announced. Nothing before the first fetch.
 */
export function LastSynced({ updatedAt }: LastSyncedProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  if (updatedAt <= 0) return null;
  const time = formatDateTime(new Date(updatedAt).toISOString(), {
    locale: isPseudoLocale(locale) ? SOURCE_LOCALE : locale,
    timeZone,
  });
  return (
    <p className="text-body-sm text-text-secondary" data-testid="last-synced">
      {t("common.syncLastSynced", { time })}
    </p>
  );
}
