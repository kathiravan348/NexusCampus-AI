import { useControlText } from "@nexus/i18n/control";
import { DATA_MODE } from "@nexus/services";
import {
  useAdvanceJob,
  useControlServices,
  useProvisioningJobs,
  useRetryProvisioning,
  useStaffCan,
  useStaffDirectory,
} from "@nexus/services/control";
import { JobSteps } from "@nexus/ui-control";
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from "@nexus/ui-core";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { PROVISIONING_STEP_KEY, STATUS_TONE, useStepStatusLabels } from "./labels";
import { StartTrialModal } from "./StartTrialModal";

/** Tenant creation jobs and their steps; staff with `ctl.provisioning.manage` start, advance (demo) and retry them. */
export function NewTenantsTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const toast = useToast();
  const can = useStaffCan();
  const { mode } = useControlServices();
  const jobs = useProvisioningJobs();
  const advance = useAdvanceJob();
  const retry = useRetryProvisioning();
  const accounts = useAccountNames();
  const names = useStaffDirectory();
  const statusLabels = useStepStatusLabels();
  const [starting, setStarting] = useState(false);
  const canManage = can("ctl.provisioning.manage");
  const isDemo = DATA_MODE !== "real" && mode !== "real";

  return (
    <div className="space-y-4">
      {canManage && (
        <Button onClick={() => setStarting(true)}>
          <Plus className="me-1 h-4 w-4" aria-hidden="true" />
          {t("p04.start")}
        </Button>
      )}
      {retry.isError && (
        <p role="alert" className="text-body-sm text-danger-text">
          {t("p04.retryFailed")}
        </p>
      )}
      {jobs.isPending ? (
        <Skeleton className="h-48" />
      ) : jobs.isError ? (
        <EmptyState tone="error" />
      ) : jobs.data.items.length === 0 ? (
        <EmptyState description={t("p04.empty")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {jobs.data.items.map((job) => (
            <li key={job.id}>
              <Card
                headingAs="h3"
                title={t("p04.jobTitle", {
                  account: accounts.get(job.request.accountId) ?? job.request.accountId,
                  region: t(`m01.region.${job.request.region}`),
                  plan: job.request.planCode,
                })}
                actions={<Badge tone={STATUS_TONE[job.status]}>{statusLabels[job.status]}</Badge>}
              >
                <div className="space-y-3">
                  <p className="text-body-sm text-text-secondary">
                    {job.request.trialDays === null
                      ? t("p04.paid")
                      : t("p04.trialDays", { days: job.request.trialDays })}
                    {" · "}
                    {job.tenantId ? t("p04.tenant", { id: job.tenantId }) : t("p04.tenantPending")}
                  </p>
                  <JobSteps
                    ariaLabel={t("p04.jobSteps", { job: job.id })}
                    statusLabels={statusLabels}
                    steps={job.steps.map((s) => ({
                      id: s.name,
                      label: t(PROVISIONING_STEP_KEY[s.name]),
                      status: s.status,
                    }))}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-body-sm text-text-secondary">
                      {t("p04.requestedBy", {
                        name: names.get(job.requestedByStaffId) ?? job.requestedByStaffId,
                        date: fmt.date(job.createdAt),
                      })}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      {isDemo && canManage && job.status !== "done" && job.status !== "failed" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={t("p04.advanceLabel", { job: job.id })}
                          disabled={advance.isPending}
                          onClick={() =>
                            advance.mutate(job.id, {
                              onSuccess: () =>
                                toast.show({ tone: "success", title: t("p04.advanced") }),
                              onError: () =>
                                toast.show({ tone: "danger", title: t("p04.advanceFailed") }),
                            })
                          }
                        >
                          {t("p04.advance")}
                        </Button>
                      )}
                      {canManage && job.status === "failed" && (
                        <Button
                          size="sm"
                          variant="secondary"
                          aria-label={t("p04.retryLabel", { job: job.id })}
                          disabled={retry.isPending}
                          onClick={() =>
                            retry.mutate(job.id, {
                              onSuccess: () =>
                                toast.show({ tone: "success", title: t("p04.retried") }),
                              onError: () =>
                                toast.show({ tone: "danger", title: t("p04.retryFailed") }),
                            })
                          }
                        >
                          {t("p04.retry")}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
      {starting && <StartTrialModal onClose={() => setStarting(false)} />}
    </div>
  );
}
