import type { Assessment, AssessmentKind, AssessmentStatus } from "@nexus/contracts";
import {
  SOURCE_LOCALE,
  formatDate,
  formatNumber,
  isPseudoLocale,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { Badge, EmptyState, type BadgeProps } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

interface AssessmentListProps {
  assessments: readonly Assessment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const kindLabels: Record<AssessmentKind, MessageKey> = {
  test: "m20.kind.test",
  assignment: "m20.kind.assignment",
  project: "m20.kind.project",
  practical: "m20.kind.practical",
  oral: "m20.kind.oral",
  observation: "m20.kind.observation",
};

const statusLabels: Record<AssessmentStatus, MessageKey> = {
  draft: "m20.status.draft",
  open: "m20.status.open",
  marking: "m20.status.marking",
  moderated: "m20.status.moderated",
  published: "m20.status.published",
};

const statusTones: Record<AssessmentStatus, NonNullable<BadgeProps["tone"]>> = {
  draft: "neutral",
  open: "success",
  marking: "info",
  moderated: "warning",
  published: "brand",
};

export function AssessmentList({ assessments, selectedId, onSelect }: AssessmentListProps) {
  const t = useText();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const sorted = [...assessments].sort(
    (a, b) =>
      Number(a.dueOn === null) - Number(b.dueOn === null) ||
      (b.dueOn ?? "").localeCompare(a.dueOn ?? "") ||
      Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
      a.id.localeCompare(b.id),
  );

  return (
    <section className="min-w-0 space-y-2">
      <h2 className="text-section-title font-semibold text-text-primary">
        {t("m20.assessments.title")}
      </h2>
      {sorted.length === 0 ? (
        <EmptyState title={t("m20.assessments.empty")} />
      ) : (
        <ul className="space-y-2">
          {sorted.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                aria-pressed={row.id === selectedId}
                onClick={() => onSelect(row.id)}
                className="flex min-h-11 w-full flex-col gap-1 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-start text-text-primary aria-pressed:border-brand-primary aria-pressed:bg-bg-raised focus-visible:outline-brand-primary"
              >
                <span className="flex w-full flex-wrap items-center justify-between gap-2">
                  <span className="break-words font-semibold">{row.name}</span>
                  <Badge tone={statusTones[row.status]}>{t(statusLabels[row.status])}</Badge>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-secondary">
                  <span>{t(kindLabels[row.kind])}</span>
                  <span>
                    {t("m20.assessments.maxMarks", {
                      max: formatNumber(row.maxMarks, safeLocale),
                    })}
                  </span>
                  <span>
                    {t("m20.assessments.weight", {
                      weight: formatNumber(row.weightPercent, safeLocale),
                    })}
                  </span>
                  {row.dueOn ? (
                    <time dateTime={row.dueOn}>
                      {t("m20.assessments.dueOn", {
                        date: formatDate(row.dueOn, { locale: safeLocale }),
                      })}
                    </time>
                  ) : (
                    <span>{t("m20.assessments.noDueDate")}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
