import { useControlText } from "@nexus/i18n/control";
import { useOffboardingJobs, useShredCertificates } from "@nexus/services/control";
import { JobSteps } from "@nexus/ui-control";
import { Badge, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { ShieldCheck } from "lucide-react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { OFFBOARDING_STEP_KEY, STATUS_TONE, useStepStatusLabels } from "./labels";

/** Customers leaving: export, key destruction (crypto-shred, V-2) and the signed certificate. */
export function OffboardingTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const jobs = useOffboardingJobs();
  const certificates = useShredCertificates();
  const accounts = useAccountNames();
  const statusLabels = useStepStatusLabels();

  if (jobs.isPending) return <Skeleton className="h-48" />;
  if (jobs.isError) return <EmptyState tone="error" />;
  if (jobs.data.items.length === 0) return <EmptyState description={t("p04.off.empty")} />;

  return (
    <ul className="space-y-4">
      {jobs.data.items.map((job) => {
        const cert = certificates.data?.items.find((c) => c.id === job.shredCertificateId);
        return (
          <li key={job.id}>
            <Card
              headingAs="h3"
              title={accounts.get(job.accountId) ?? job.accountId}
              actions={<Badge tone={STATUS_TONE[job.status]}>{statusLabels[job.status]}</Badge>}
            >
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
                      <dd className="font-mono text-text-primary">{cert.keyIds.join(", ")}</dd>
                      <dt className="text-text-secondary">{t("p04.cert.at")}</dt>
                      <dd className="text-text-primary">{fmt.date(cert.destroyedAt)}</dd>
                      <dt className="text-text-secondary">{t("p04.cert.signedWith")}</dt>
                      <dd className="font-mono text-text-primary">{cert.signingKeyId}</dd>
                    </dl>
                  </section>
                )}
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
