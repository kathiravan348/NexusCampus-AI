import type { OffboardingJob, OffboardingStepName } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { ApiRequestError } from "@nexus/services";
import {
  useApproveDestroy,
  useConfirmDownload,
  useOffboardingJobs,
  useRetryOffboarding,
  useShredCertificates,
  useStaffCan,
} from "@nexus/services/control";
import { JobSteps } from "@nexus/ui-control";
import { Badge, Button, Card, EmptyState, Modal, Skeleton, useToast } from "@nexus/ui-core";
import { Plus, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { OFFBOARDING_STEP_KEY, STATUS_TONE, useStepStatusLabels } from "./labels";
import { StartOffboardingModal } from "./StartOffboardingModal";

function stepOf(job: OffboardingJob, name: OffboardingStepName) {
  return job.steps.find((s) => s.name === name)?.status;
}

/** Customers leaving: export, key destruction (crypto-shred, V-2) and the signed certificate. */
export function OffboardingTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const toast = useToast();
  const can = useStaffCan();
  const jobs = useOffboardingJobs();
  const certificates = useShredCertificates();
  const confirmDownload = useConfirmDownload();
  const approveDestroy = useApproveDestroy();
  const retryOffboarding = useRetryOffboarding();
  const accounts = useAccountNames();
  const statusLabels = useStepStatusLabels();
  const [starting, setStarting] = useState(false);
  const [approvingJob, setApprovingJob] = useState<OffboardingJob | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const canManage = can("ctl.provisioning.manage");

  return (
    <div className="space-y-4">
      {canManage && (
        <Button onClick={() => setStarting(true)}>
          <Plus className="me-1 h-4 w-4" aria-hidden="true" />
          {t("p04.off.start")}
        </Button>
      )}
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
        <EmptyState description={t("p04.off.empty")} />
      ) : (
        <ul className="space-y-4">
          {jobs.data.items.map((job) => {
            const cert = certificates.data?.items.find((c) => c.id === job.shredCertificateId);
            const canConfirmExport =
              canManage &&
              job.status !== "failed" &&
              stepOf(job, "export_ready") === "done" &&
              stepOf(job, "export_downloaded") === "pending";
            const canApproveDestroy =
              canManage &&
              job.status !== "failed" &&
              stepOf(job, "export_downloaded") === "done" &&
              stepOf(job, "keys_destroyed") === "pending";
            const canRetry = canManage && job.status === "failed";

            return (
              <li key={job.id}>
                <Card
                  headingAs="h3"
                  title={accounts.get(job.accountId) ?? job.accountId}
                  actions={<Badge tone={STATUS_TONE[job.status]}>{statusLabels[job.status]}</Badge>}
                >
                  <div className="space-y-3">
                    <p className="text-body-sm text-text-secondary">
                      {t("p04.tenant", { id: job.tenantId })}
                    </p>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <JobSteps
                        ariaLabel={t("p04.jobSteps", { job: job.id })}
                        statusLabels={statusLabels}
                        steps={job.steps.map((s) => ({
                          id: s.name,
                          label: t(OFFBOARDING_STEP_KEY[s.name]),
                          status: s.status,
                        }))}
                      />
                      {cert && (
                        <section
                          aria-label={t("p04.cert.title")}
                          className="space-y-2 rounded-md border border-border-default bg-bg-raised p-3"
                        >
                          <h4 className="flex items-center gap-2 text-body font-medium text-text-primary">
                            <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
                            {t("p04.cert.title")}
                          </h4>
                          <dl className="space-y-1 text-body-sm">
                            <dt className="text-text-secondary">{t("p04.cert.keys")}</dt>
                            <dd className="font-mono text-text-primary">
                              {cert.keyIds.join(", ")}
                            </dd>
                            <dt className="text-text-secondary">{t("p04.cert.at")}</dt>
                            <dd className="text-text-primary">{fmt.date(cert.destroyedAt)}</dd>
                            <dt className="text-text-secondary">{t("p04.cert.signedWith")}</dt>
                            <dd className="font-mono text-text-primary">{cert.signingKeyId}</dd>
                          </dl>
                        </section>
                      )}
                    </div>
                    {(canConfirmExport || canApproveDestroy || canRetry) && (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {canConfirmExport && (
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={t("p04.off.confirmDownloadLabel", { job: job.id })}
                            disabled={confirmDownload.isPending}
                            onClick={() => {
                              setErrorMessage(null);
                              confirmDownload.mutate(job.id, {
                                onSuccess: () =>
                                  toast.show({
                                    tone: "success",
                                    title: t("p04.off.downloadConfirmed"),
                                  }),
                                onError: () => {
                                  const msg = t("p04.off.actionFailed");
                                  setErrorMessage(msg);
                                  toast.show({ tone: "danger", title: msg });
                                },
                              });
                            }}
                          >
                            {t("p04.off.confirmDownload")}
                          </Button>
                        )}
                        {canApproveDestroy && (
                          <Button
                            size="sm"
                            variant="danger"
                            aria-label={t("p04.off.approveDestroyLabel", { job: job.id })}
                            disabled={approveDestroy.isPending}
                            onClick={() => {
                              setErrorMessage(null);
                              setApprovingJob(job);
                            }}
                          >
                            {t("p04.off.approveDestroy")}
                          </Button>
                        )}
                        {canRetry && (
                          <Button
                            size="sm"
                            variant="secondary"
                            aria-label={t("p04.retryLabel", { job: job.id })}
                            disabled={retryOffboarding.isPending}
                            onClick={() => {
                              setErrorMessage(null);
                              retryOffboarding.mutate(job.id, {
                                onSuccess: () =>
                                  toast.show({ tone: "success", title: t("p04.retried") }),
                                onError: () => {
                                  const msg = t("p04.retryFailed");
                                  setErrorMessage(msg);
                                  toast.show({ tone: "danger", title: msg });
                                },
                              });
                            }}
                          >
                            {t("p04.retry")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {starting && <StartOffboardingModal onClose={() => setStarting(false)} />}
      {approvingJob && (
        <Modal
          open
          onOpenChange={(open) => {
            if (!open) setApprovingJob(null);
          }}
          title={t("p04.off.approveTitle", {
            account: accounts.get(approvingJob.accountId) ?? approvingJob.accountId,
          })}
          description={t("p04.off.approveBody", { tenant: approvingJob.tenantId })}
          footer={
            <>
              <Button variant="secondary" onClick={() => setApprovingJob(null)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant="danger"
                disabled={approveDestroy.isPending}
                onClick={() => {
                  setErrorMessage(null);
                  approveDestroy.mutate(approvingJob.id, {
                    onSuccess: (updated) => {
                      const keysStep = stepOf(updated, "keys_destroyed");
                      const title =
                        keysStep === "pending"
                          ? t("p04.off.approvedFirst")
                          : t("p04.off.approvedQueued");
                      toast.show({ tone: "success", title });
                      setApprovingJob(null);
                    },
                    onError: (err) => {
                      const msg =
                        err instanceof ApiRequestError && err.status === 409
                          ? t("p04.off.approveSameStaff")
                          : t("p04.off.actionFailed");
                      setErrorMessage(msg);
                      toast.show({ tone: "danger", title: msg });
                    },
                  });
                }}
              >
                {t("p04.off.approveConfirm")}
              </Button>
            </>
          }
        >
          {errorMessage && (
            <p role="alert" className="text-body-sm text-danger-text">
              {errorMessage}
            </p>
          )}
        </Modal>
      )}
    </div>
  );
}
