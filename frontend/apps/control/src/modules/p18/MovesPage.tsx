import { useControlText } from "@nexus/i18n/control";
import { usePortabilityJobs } from "@nexus/services/control";
import { JobSteps } from "@nexus/ui-control";
import { Badge, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { LockKeyhole } from "lucide-react";
import { STATUS_TONE, useStepStatusLabels } from "../../app/jobStatus";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { DIRECTION_KEY, MOVE_STEP_KEY } from "./labels";

/** P18 Tenant portability & migrations (read-only): every move with its seven steps. */
export default function MovesPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const accounts = useAccountNames();
  const jobs = usePortabilityJobs();
  const statusLabels = useStepStatusLabels();

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("p18.nav")}
        </h1>
        <p className="flex max-w-prose items-start gap-2 text-body text-text-secondary">
          <LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          {t("p18.rule")}
        </p>
      </div>
      {jobs.isPending ? (
        <Skeleton className="h-48" />
      ) : jobs.isError ? (
        <EmptyState tone="error" />
      ) : jobs.data.items.length === 0 ? (
        <EmptyState description={t("p18.empty")} />
      ) : (
        <ul className="space-y-4">
          {jobs.data.items.map((job) => (
            <li key={job.id}>
              <Card
                headingAs="h2"
                title={accounts.get(job.accountId) ?? job.accountId}
                actions={<Badge tone={STATUS_TONE[job.status]}>{statusLabels[job.status]}</Badge>}
              >
                <div className="space-y-3">
                  <p className="text-body-sm text-text-secondary">
                    {job.fromRegion === job.toRegion
                      ? t("p18.meta", {
                          direction: t(DIRECTION_KEY[job.direction]),
                          region: t(`m01.region.${job.fromRegion}`),
                          date: fmt.date(job.createdAt),
                        })
                      : t("p18.metaMove", {
                          direction: t(DIRECTION_KEY[job.direction]),
                          from: t(`m01.region.${job.fromRegion}`),
                          to: t(`m01.region.${job.toRegion}`),
                          date: fmt.date(job.createdAt),
                        })}
                  </p>
                  <JobSteps
                    ariaLabel={t("p18.steps", { job: job.id })}
                    statusLabels={statusLabels}
                    steps={job.steps.map((s) => ({
                      id: s.name,
                      label: t(MOVE_STEP_KEY[s.name]),
                      status: s.status,
                    }))}
                  />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
