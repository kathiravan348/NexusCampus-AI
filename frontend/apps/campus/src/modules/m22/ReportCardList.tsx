import type { ReportCard, ReportCardStatus } from "@nexus/contracts";
import {
  formatDateTime,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { Badge, EmptyState, type BadgeProps } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

export const statusLabels: Record<ReportCardStatus, MessageKey> = {
  draft: "m22.status.draft",
  approved: "m22.status.approved",
  published: "m22.status.published",
  withdrawn: "m22.status.withdrawn",
};
export const statusTones: Record<ReportCardStatus, NonNullable<BadgeProps["tone"]>> = {
  draft: "neutral",
  approved: "info",
  published: "success",
  withdrawn: "warning",
};

interface Props {
  readonly cards: readonly ReportCard[];
  readonly names: ReadonlyMap<string, string>;
  readonly onOpen: (id: string) => void;
}

export function ReportCardList({ cards, names, onOpen }: Props) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const local = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  if (!cards.length) return <EmptyState title={t("m22.list.empty")} />;
  return (
    <ul aria-label={t("m22.nav.title")} className="space-y-3">
      {cards.map((card) => (
        <li key={card.id} className="rounded-lg border border-border-default bg-bg-surface">
          <button
            type="button"
            onClick={() => onOpen(card.id)}
            className="flex min-h-11 w-full flex-col items-start gap-2 rounded-lg p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary sm:flex-row sm:items-center sm:justify-between"
          >
            <span className="min-w-0 break-words font-semibold text-text-primary">
              {names.get(card.learnerId) ?? t("term.learner")}
            </span>
            <span>{t("m22.list.term")}</span>
            <Badge tone={statusTones[card.status]}>{t(statusLabels[card.status])}</Badge>
            {card.publishedAt && (
              <span className="text-body-sm text-text-secondary">
                {t("m22.list.publishedAt", {
                  date: formatDateTime(card.publishedAt, { locale: local, timeZone }),
                })}
              </span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
