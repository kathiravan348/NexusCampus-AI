import type { AttendanceSession } from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { Badge, EmptyState } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

interface SessionListProps {
  sessions: readonly AttendanceSession[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function SessionList({ sessions, selectedId, onSelect }: SessionListProps) {
  const t = useText();
  const { locale } = useRuntime();
  const dateLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const sorted = [...sessions].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
  return (
    <section className="space-y-2">
      <h2 className="text-section-title font-semibold">{t("m17.sessions.title")}</h2>
      {sorted.length === 0 ? (
        <EmptyState title={t("m17.sessions.empty")} />
      ) : (
        <ul className="space-y-2">
          {sorted.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                aria-pressed={row.id === selectedId}
                onClick={() => onSelect(row.id)}
                className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-start text-text-primary aria-pressed:border-brand-primary focus-visible:outline-brand-primary"
              >
                <time dateTime={row.date}>{formatDate(row.date, { locale: dateLocale })}</time>
                <span>{t(`m17.mode.${row.mode}`)}</span>
                {row.eventLabel && <span className="break-words">{row.eventLabel}</span>}
                <Badge tone={row.status === "open" ? "success" : "neutral"}>
                  {t(`m17.sessionStatus.${row.status}`)}
                </Badge>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
