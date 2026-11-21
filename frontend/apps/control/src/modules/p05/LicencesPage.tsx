import { useControlText } from "@nexus/i18n/control";
import { useLicences, useStaffCan, useUsageRecords } from "@nexus/services/control";
import { EmptyState, Skeleton } from "@nexus/ui-core";
import { useMemo } from "react";
import { useAccountNames } from "../../app/names";
import { LicenceCard } from "./LicenceCard";

/** P05 Licence management: self-hosted licences, caps, renewals and signed files. */
export default function LicencesPage() {
  const t = useControlText();
  const can = useStaffCan();
  const licences = useLicences();
  const usage = useUsageRecords(can("ctl.usage.read"));
  const accounts = useAccountNames();
  const learnersByDeployment = useMemo(
    () =>
      new Map(
        (usage.data?.items ?? [])
          .filter((u) => u.metric === "learners" && u.deploymentId !== null)
          .map((u) => [u.deploymentId, u]),
      ),
    [usage.data],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("p05.nav")}
        </h1>
        <p className="max-w-prose text-body text-text-secondary">{t("p05.intro")}</p>
      </div>
      {licences.isPending ? (
        <Skeleton className="h-64" />
      ) : licences.isError ? (
        <EmptyState tone="error" />
      ) : licences.data.items.length === 0 ? (
        <EmptyState description={t("p05.empty")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {licences.data.items.map((l) => (
            <li key={l.id}>
              <LicenceCard
                licence={l}
                accountName={accounts.get(l.accountId) ?? l.accountId}
                learners={l.deploymentId ? learnersByDeployment.get(l.deploymentId) : undefined}
                canIssue={can("ctl.licence.issue")}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
