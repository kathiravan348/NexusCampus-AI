import type { PortabilityJob, PortabilityStepName } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { usePortabilityJobs, useRetryMove, useStaffCan } from "@nexus/services/control";
import { JobSteps } from "@nexus/ui-control";
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from "@nexus/ui-core";
import { LockKeyhole, Plus } from "lucide-react";
import { useState } from "react";
import { useControlFormat } from "../../app/format";
import { STATUS_TONE, useStepStatusLabels } from "../../app/jobStatus";
import { useAccountNames } from "../../app/names";
import { ConfirmStepModal, isSourceCell, isStaffMoveStep } from "./ConfirmStepModal";
import { DIRECTION_KEY, MOVE_STEP_KEY } from "./labels";
import { StartMoveModal } from "./StartMoveModal";

/** P18 Tenant portability & migrations: start a move, confirm its manual staff steps, and retry (NEX-142). */
export default function MovesPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const toast = useToast();
  const can = useStaffCan();
  const accounts = useAccountNames();
  const jobs = usePortabilityJobs();
  const retry = useRetryMove();
  const statusLabels = useStepStatusLabels();
  const [starting, setStarting] = useState(false);
  const [confirming, setConfirming] = useState<{
    readonly job: PortabilityJob;
    readonly step: PortabilityStepName;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canManage = can("ctl.portability.manage");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-sans text-page-title font-semibold text-text-primary">
            {t("p18.nav")}
          </h1>
          <p className="flex max-w-prose items-start gap-2 text-body text-text-secondary">
            <LockKeyhole className="mt-1 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            {t("p18.rule")}
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setStarting(true)}>
            <Plus className="me-1 h-4 w-4" aria-hidden="true" />
            {t("p18.start")}
          </Button>
        )}
      </div>
      {errorMessage && (
        <p role="alert" className="text-body-sm text-danger-text">
          {errorMessage}
        </p>
      )}
      {jobs.isPending ? (
        <Skeleton className="h-48" />
      ) : jobs.isError ? (
        <EmptyState tone="error" />
      ) : jobs.data.items.length === 0 ? (
        <EmptyState description={t("p18.empty")} />
      ) : (
        <ul className="space-y-4">
          {jobs.data.items.map((job) => {
            const current = job.steps.find((s) => s.status !== "done");
            const canConfirm =
              canManage &&
              job.status !== "failed" &&
              current !== undefined &&
              current.status === "pending" &&
              isStaffMoveStep(job.direction, current.name);
            const canRetry = canManage && job.status === "failed";
            const showCellShredNote =
              current?.name === "shred_source" && isSourceCell(job.direction);

            return (
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
                      {" · "}
                      {t("p18.tenant", { id: job.tenantId })}
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
                    {(showCellShredNote || canConfirm || canRetry) && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        {showCellShredNote ? (
                          <p className="text-body-sm text-text-secondary">
                            {t("p18.shredOnProvisioning")}
                          </p>
                        ) : (
                          <span />
                        )}
                        <div className="flex flex-wrap items-center gap-2">
                          {canConfirm && current && (
                            <Button
                              size="sm"
                              variant="secondary"
                              aria-label={t("p18.confirmStepLabel", {
                                step: t(MOVE_STEP_KEY[current.name]),
                                job: job.id,
                              })}
                              onClick={() => {
                                setErrorMessage(null);
                                setConfirming({ job, step: current.name });
                              }}
                            >
                              {t("p18.confirm")}
                            </Button>
                          )}
                          {canRetry && (
                            <Button
                              size="sm"
                              variant="secondary"
                              aria-label={t("p18.retryLabel", { job: job.id })}
                              disabled={retry.isPending}
                              onClick={() => {
                                setErrorMessage(null);
                                retry.mutate(job.id, {
                                  onSuccess: () =>
                                    toast.show({ tone: "success", title: t("p18.retried") }),
                                  onError: () => {
                                    const msg = t("p18.retryFailed");
                                    setErrorMessage(msg);
                                    toast.show({ tone: "danger", title: msg });
                                  },
                                });
                              }}
                            >
                              {t("p18.retry")}
                            </Button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {starting && <StartMoveModal onClose={() => setStarting(false)} />}
      {confirming && (
        <ConfirmStepModal
          job={confirming.job}
          step={confirming.step}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
