import type {
  ImportEntity,
  ImportJob,
  ImportJobStatus,
  ImportRowIssueSeverity,
  ImportSourceFormat,
  ImportTransform,
} from "@nexus/contracts";
import {
  formatDateTime,
  formatNumber,
  isKnownMessageKey,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { useImportJobIssues, useImportJobMappings } from "@nexus/services";
import { Badge, Button, Card, cn, EmptyState, Skeleton, type BadgeProps } from "@nexus/ui-core";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";

type BadgeSpec = readonly [MessageKey, NonNullable<BadgeProps["tone"]>];
type SummaryRow = readonly [label: string, value: string, mono?: boolean];

export const IMPORT_ENTITY_KEY: Readonly<Record<ImportEntity, MessageKey>> = {
  learner: "m09.entity.learner",
  guardian: "m09.entity.guardian",
  staff: "m09.entity.staff",
  enrolment: "m09.entity.enrolment",
  fee_balance: "m09.entity.feeBalance",
  mark: "m09.entity.mark",
};

export const IMPORT_FORMAT_KEY: Readonly<Record<ImportSourceFormat, MessageKey>> = {
  csv: "m09.format.csv",
  xlsx: "m09.format.xlsx",
};

export const IMPORT_JOB_STATUS: Readonly<Record<ImportJobStatus, BadgeSpec>> = {
  uploaded: ["m09.status.uploaded", "info"],
  mapped: ["m09.status.mapped", "info"],
  dry_run_ready: ["m09.status.dryRunReady", "warning"],
  importing: ["m09.status.importing", "brand"],
  completed: ["m09.status.completed", "success"],
  failed: ["m09.status.failed", "danger"],
  rolled_back: ["m09.status.rolledBack", "neutral"],
};

const TRANSFORM_KEY: Readonly<Record<ImportTransform, MessageKey>> = {
  none: "m09.transform.none",
  trim: "m09.transform.trim",
  upper: "m09.transform.upper",
  lower: "m09.transform.lower",
  date_dmy: "m09.transform.dateDmy",
  date_mdy: "m09.transform.dateMdy",
  phone_in: "m09.transform.phoneIn",
  split_name: "m09.transform.splitName",
};

const ISSUE_SEVERITY: Readonly<Record<ImportRowIssueSeverity, BadgeSpec>> = {
  error: ["m09.severity.error", "danger"],
  warning: ["m09.severity.warning", "warning"],
};

export interface ImportJobViewProps {
  readonly job: ImportJob;
  readonly onBack?: () => void;
}

/** Detail view for one import job (M09, L0): status, counts, mappings and dry-run issues. */
export function ImportJobView({ job, onBack }: ImportJobViewProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const mappings = useImportJobMappings(job.id);
  const issues = useImportJobIssues(job.id);

  const [statusKey, statusTone] = IMPORT_JOB_STATUS[job.status];
  const columns = (mappings.data?.items ?? []).flatMap((item) => item.columns);
  const issueList = issues.data?.items ?? [];

  const summaryRows: SummaryRow[] = [
    [t("common.status"), t(statusKey)],
    [t("m09.job.entity"), t(IMPORT_ENTITY_KEY[job.entity])],
    [t("m09.job.format"), t(IMPORT_FORMAT_KEY[job.sourceFormat])],
    [t("m09.job.created"), formatDateTime(job.createdAt, { locale: safeLocale, timeZone })],
    [t("m09.job.totalRows"), formatNumber(job.totalRows, safeLocale), true],
    [t("m09.job.validRows"), formatNumber(job.validRows, safeLocale), true],
    [t("m09.job.errorRows"), formatNumber(job.errorRows, safeLocale), true],
  ];
  if (job.status === "completed" && job.rollbackUntil !== null) {
    summaryRows.push([
      t("m09.job.rollbackUntil"),
      formatDateTime(job.rollbackUntil, { locale: safeLocale, timeZone }),
    ]);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        {onBack && (
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
            {t("m09.job.back")}
          </Button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="min-w-0 break-all font-sans text-page-title font-semibold text-text-primary">
            {job.fileName}
          </h1>
          <Badge tone={statusTone}>{t(statusKey)}</Badge>
          <Badge tone="neutral">{t(IMPORT_ENTITY_KEY[job.entity])}</Badge>
          <Badge tone="neutral">{t(IMPORT_FORMAT_KEY[job.sourceFormat])}</Badge>
        </div>
      </header>

      <Card title={t("m09.job.summaryHeading")}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {summaryRows.map(([label, value, mono]) => (
            <div key={label} className="min-w-0 space-y-1">
              <dt className="text-body-sm font-medium text-text-secondary">{label}</dt>
              <dd
                className={cn(
                  mono && "font-mono tabular-nums",
                  "break-words text-body text-text-primary",
                )}
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title={t("m09.job.mappingsHeading")}>
        {mappings.isPending && !mappings.data ? (
          <Skeleton className="h-20 w-full" />
        ) : mappings.isError && !mappings.data ? (
          <EmptyState
            tone="error"
            title={t("m09.job.mappingsError")}
            action={
              <Button variant="secondary" size="sm" onClick={() => void mappings.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : columns.length === 0 ? (
          <p className="text-body-sm text-text-muted">{t("m09.job.mappingsEmpty")}</p>
        ) : (
          <ul aria-label={t("m09.job.mappingsListLabel")} className="space-y-2">
            {columns.map((column, index) => (
              <li
                key={`${column.sourceHeader}-${column.target ?? "skip"}-${index}`}
                className="flex flex-col gap-2 rounded-md border border-border-default bg-bg-raised p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <span className="break-words text-body font-medium text-text-primary">
                    {column.sourceHeader}
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-text-muted rtl:rotate-180"
                    aria-hidden="true"
                  />
                  {column.target !== null ? (
                    <code className="break-all font-mono text-body-sm text-text-primary">
                      {column.target}
                    </code>
                  ) : (
                    <Badge tone="neutral">{t("m09.job.skippedColumn")}</Badge>
                  )}
                </div>
                <div className="shrink-0">
                  <Badge tone="info">{t(TRANSFORM_KEY[column.transform])}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("m09.job.issuesHeading")}>
        <p className="mb-3 text-body-sm text-text-secondary">{t("m09.job.issuesPrivacy")}</p>
        {issues.isPending && !issues.data ? (
          <Skeleton className="h-20 w-full" />
        ) : issues.isError && !issues.data ? (
          <EmptyState
            tone="error"
            title={t("m09.job.issuesError")}
            action={
              <Button variant="secondary" size="sm" onClick={() => void issues.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : issueList.length === 0 ? (
          <p className="text-body-sm text-text-muted">{t("m09.job.issuesEmpty")}</p>
        ) : (
          <ul aria-label={t("m09.job.issuesListLabel")} className="space-y-2">
            {issueList.map((issue, index) => {
              const [severityKey, severityTone] = ISSUE_SEVERITY[issue.severity];
              return (
                <li
                  key={`${issue.rowNumber}-${issue.column ?? "row"}-${issue.code}-${index}`}
                  className="min-w-0 space-y-1.5 rounded-md border border-border-default bg-bg-raised p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={severityTone}>{t(severityKey)}</Badge>
                    <span className="font-mono text-number-sm font-medium text-text-primary tabular-nums">
                      {t("m09.job.issueRow", { row: formatNumber(issue.rowNumber, safeLocale) })}
                    </span>
                    <span className="break-words text-body-sm text-text-secondary">
                      {issue.column !== null
                        ? t("m09.job.issueColumn", { column: issue.column })
                        : t("m09.job.issueWholeRow")}
                    </span>
                  </div>
                  <p className="break-words text-body-sm text-text-primary">
                    {isKnownMessageKey(issue.messageKey)
                      ? t(issue.messageKey)
                      : t("m09.import.unknownIssue")}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
