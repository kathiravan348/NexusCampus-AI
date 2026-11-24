import { formatDateTime, formatNumber, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAiSettings,
  useEntitlements,
  useImportJobs,
  useMe,
} from "@nexus/services";
import { Badge, Button, EmptyState, Skeleton } from "@nexus/ui-core";
import { FileUp, Plus, SearchX, Sparkles } from "lucide-react";
import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { Forbidden } from "../../pages/Forbidden";
import { AssistPanel } from "../m11/AssistPanel";
import { IMPORT_ENTITY_KEY, IMPORT_JOB_STATUS, ImportJobView } from "./ImportJobView";
import { NewImportDialog } from "./NewImportDialog";

/**
 * Import data (M09, L0): lists past import jobs, opens job mappings and dry-run issues via
 * `?job=`, lets managers register a new file without reading its contents, and offers Assist.
 */
export function ImportsPage() {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const online = useOnline();
  const [searchParams, setSearchParams] = useSearchParams();
  const me = useMe();
  const entitlements = useEntitlements();
  const jobs = useImportJobs();
  const [newOpen, setNewOpen] = useState(false);
  const [assistOpen, setAssistOpen] = useState(false);

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const rawJobId = searchParams.get("job")?.trim() ?? "";
  const selectedJobId = rawJobId.length > 0 ? rawJobId : null;

  const m11Entitled =
    entitlements.data?.items.some((entry) => entry.moduleId === "M11" && entry.enabled) ?? false;
  const canAskAssist = me.data?.permissions.includes("m11.assist.use") ?? false;
  const aiSettings = useAiSettings(online && m11Entitled && canAskAssist);

  if ((me.isPending && !me.data) || (jobs.isPending && !jobs.data)) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (jobs.isError && !jobs.data) {
    if (jobs.error instanceof ApiRequestError && jobs.error.status === 403) return <Forbidden />;
    return (
      <EmptyState
        tone="error"
        title={t("m09.imports.error")}
        action={
          <Button variant="secondary" onClick={() => void jobs.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  if (me.isError && !me.data) {
    return (
      <EmptyState
        tone="error"
        title={t("m09.imports.error")}
        action={
          <Button variant="secondary" onClick={() => void me.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const jobList = [...(jobs.data?.items ?? [])].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );

  if (selectedJobId !== null) {
    const selectedJob = jobList.find((item) => item.id === selectedJobId) ?? null;
    if (!selectedJob) {
      return (
        <EmptyState
          icon={<SearchX className="h-6 w-6" />}
          title={t("m09.job.notFoundTitle")}
          description={t("m09.job.notFoundBody")}
          action={
            <Button variant="secondary" onClick={() => setSearchParams({})}>
              {t("m09.job.back")}
            </Button>
          }
        />
      );
    }
    return <ImportJobView job={selectedJob} onBack={() => setSearchParams({})} />;
  }

  const canManage = me.data?.permissions.includes("m09.import.manage") ?? false;
  const showAssist = online && m11Entitled && canAskAssist && (aiSettings.data?.enabled ?? false);
  const emptyAction = canManage ? (
    <Button onClick={() => setNewOpen(true)}>{t("m09.imports.newImport")}</Button>
  ) : undefined;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="font-sans text-page-title font-semibold text-text-primary">
            {t("m09.nav.title")}
          </h1>
          <p className="text-body text-text-secondary">{t("m09.imports.intro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showAssist && (
            <Button variant="secondary" size="sm" onClick={() => setAssistOpen(true)}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("m09.imports.askAssist")}
            </Button>
          )}
          {canManage && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("m09.imports.newImport")}
            </Button>
          )}
        </div>
      </header>

      {jobList.length === 0 ? (
        <EmptyState
          icon={<FileUp className="h-6 w-6" />}
          title={t("m09.jobs.empty")}
          description={t("m09.jobs.emptyBody")}
          action={emptyAction}
        />
      ) : (
        <ul aria-label={t("m09.jobs.listLabel")} className="space-y-3">
          {jobList.map((job) => {
            const [statusKey, statusTone] = IMPORT_JOB_STATUS[job.status];
            return (
              <li key={job.id} className="min-w-0">
                <Link
                  to={`?job=${encodeURIComponent(job.id)}`}
                  className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4 transition-colors hover:bg-bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-ground sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-all text-body font-semibold text-text-primary">
                        {job.fileName}
                      </span>
                      <Badge tone="neutral">{t(IMPORT_ENTITY_KEY[job.entity])}</Badge>
                    </div>
                    <p className="font-mono text-number-sm text-text-secondary tabular-nums">
                      {t("m09.jobs.rowCounts", {
                        valid: formatNumber(job.validRows, safeLocale),
                        errorCount: job.errorRows,
                        errors: formatNumber(job.errorRows, safeLocale),
                        total: formatNumber(job.totalRows, safeLocale),
                      })}
                    </p>
                    <p className="text-body-sm text-text-muted">
                      {t("m09.jobs.createdAt", {
                        date: formatDateTime(job.createdAt, { locale: safeLocale, timeZone }),
                      })}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <Badge tone={statusTone}>{t(statusKey)}</Badge>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {canManage && <NewImportDialog open={newOpen} onOpenChange={setNewOpen} />}
      {showAssist && <AssistPanel open={assistOpen} onOpenChange={setAssistOpen} />}
    </div>
  );
}

export default ImportsPage;
