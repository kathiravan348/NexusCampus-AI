import type { ReportCard } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { useSubjects } from "@nexus/services";
import { Badge } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";
import { statusLabels, statusTones } from "./ReportCardList";
import { StatusDialog } from "./StatusDialog";

interface Props {
  readonly card: ReportCard;
  readonly learnerName: string | undefined;
  readonly canPublish: boolean;
}

export function ReportCardView({ card, learnerName, canPublish }: Props) {
  const t = useText();
  const { locale } = useRuntime();
  const local = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const subjects = useSubjects();
  const names = new Map((subjects.data?.items ?? []).map((subject) => [subject.id, subject.name]));
  return (
    <article className="space-y-4 rounded-lg border border-border-default bg-bg-surface p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="min-w-0 break-words text-section-title font-semibold">
          {learnerName ?? t("term.learner")} · {t("m22.list.term")}
        </h2>
        <Badge tone={statusTones[card.status]}>{t(statusLabels[card.status])}</Badge>
      </header>
      <ul className="space-y-3">
        {card.lines.map((line, index) => (
          <li
            key={`${line.subjectId}-${index}`}
            className="space-y-2 border-t border-border-default pt-3"
          >
            <h3 className="break-words font-semibold">
              {names.get(line.subjectId) ?? t("m22.view.subject")}
            </h3>
            <dl className="grid gap-2 sm:grid-cols-2">
              <div>
                <dt>{t("m22.view.grade")}</dt>
                <dd>{line.grade}</dd>
              </div>
              <div>
                <dt>{t("m22.view.marks")}</dt>
                <dd>
                  {line.marksPercent === null
                    ? t("m22.view.noMark")
                    : t("m22.view.percent", {
                        value: formatNumber(line.marksPercent, local, { maximumFractionDigits: 2 }),
                      })}
                </dd>
              </div>
            </dl>
            {line.remark && (
              <p className="whitespace-pre-wrap break-words text-text-secondary">{line.remark}</p>
            )}
          </li>
        ))}
      </ul>
      {card.overallRemark && (
        <section className="space-y-1 border-t border-border-default pt-3">
          <h3 className="font-semibold">{t("m22.view.overall")}</h3>
          <p className="whitespace-pre-wrap break-words">{card.overallRemark}</p>
        </section>
      )}
      {canPublish && <StatusDialog key={card.id} card={card} />}
    </article>
  );
}
