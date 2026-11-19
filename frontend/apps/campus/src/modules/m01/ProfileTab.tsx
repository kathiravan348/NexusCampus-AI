import type { Institution, InstitutionStatus } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { useInstitutionProfile } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { Lock } from "lucide-react";
import { REGION_KEY, STRUCTURE_KEY, TYPE_KEY } from "./formErrors";

const STATUS_KEY: Readonly<Record<InstitutionStatus, MessageKey>> = {
  active: "m01.status.active",
  trial: "m01.status.trial",
  suspended: "m01.status.suspended",
};

const STATUS_TONE = {
  active: "success",
  trial: "info",
  suspended: "danger",
} as const;

export interface ProfileTabProps {
  readonly institution: Institution;
}

/** Institution identity, fixed data region (G-5), and read-only type profile defaults (M01). */
export function ProfileTab({ institution }: ProfileTabProps) {
  const t = useText();
  const profile = useInstitutionProfile(institution.id);

  return (
    <div className="space-y-6">
      <Card title={t("m01.profile.identityHeading")}>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-label font-semibold text-text-muted">{t("m01.profile.name")}</dt>
            <dd className="mt-1 text-body font-medium text-text-primary">{institution.name}</dd>
          </div>
          <div>
            <dt className="text-label font-semibold text-text-muted">{t("m01.profile.type")}</dt>
            <dd className="mt-1 text-body text-text-primary">{t(TYPE_KEY[institution.type])}</dd>
          </div>
          <div>
            <dt className="text-label font-semibold text-text-muted">{t("m01.profile.status")}</dt>
            <dd className="mt-1">
              <Badge tone={STATUS_TONE[institution.status]}>
                {t(STATUS_KEY[institution.status])}
              </Badge>
            </dd>
          </div>
          <div>
            <dt className="text-label font-semibold text-text-muted">{t("m01.profile.region")}</dt>
            <dd className="mt-1 space-y-1">
              <div className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
                <Badge tone="neutral">{t(REGION_KEY[institution.region])}</Badge>
              </div>
              <p className="text-body-sm text-text-muted">{t("m01.profile.regionNote")}</p>
            </dd>
          </div>
        </dl>
      </Card>

      <Card title={t("m01.profile.defaultsHeading")}>
        {profile.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-5 w-64" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : profile.isError ? (
          <EmptyState
            tone="error"
            title={t("m01.profile.error")}
            action={
              <Button variant="secondary" onClick={() => void profile.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-label font-semibold text-text-muted">
                {t("m01.profile.structure")}
              </dt>
              <dd className="mt-1 text-body text-text-primary">
                {t(STRUCTURE_KEY[profile.data.structure])}
              </dd>
            </div>
            <div>
              <dt className="text-label font-semibold text-text-muted">
                {t("m01.profile.gradingScheme")}
              </dt>
              <dd className="mt-1 font-mono text-body-sm text-text-primary">
                {profile.data.gradingScheme}
              </dd>
            </div>
            <div>
              <dt className="text-label font-semibold text-text-muted">
                {t("m01.profile.terminologyPack")}
              </dt>
              <dd className="mt-1 text-body text-text-primary">
                {t(TYPE_KEY[profile.data.terminologyPack])}
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-label font-semibold text-text-muted">
                {t("m01.profile.defaultModules")}
              </dt>
              <dd className="mt-2 flex flex-wrap gap-2">
                {profile.data.defaultModules.map((moduleId) => (
                  <Badge key={moduleId} tone="neutral">
                    {moduleId}
                  </Badge>
                ))}
              </dd>
            </div>
          </dl>
        )}
      </Card>
    </div>
  );
}
