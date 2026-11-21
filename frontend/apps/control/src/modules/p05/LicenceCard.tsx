import type { Licence, UsageRecord } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useFetchLicenceFile, useRenewLicence } from "@nexus/services/control";
import { Badge, Button, Card, Meter, useToast } from "@nexus/ui-core";
import { Download, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { downloadJson } from "../../app/download";
import { useControlFormat } from "../../app/format";
import { EDITION_KEY, STATE } from "./labels";

function Fact({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-body-sm text-text-secondary">{label}</dt>
      <dd className="text-body text-text-primary">{children}</dd>
    </div>
  );
}

export interface LicenceCardProps {
  readonly licence: Licence;
  readonly accountName: string;
  /** Latest learners count reported by the install, if any (PII-free). */
  readonly learners: UsageRecord | undefined;
  readonly canIssue: boolean;
}

/** One self-hosted licence: terms, caps, state and (for issuers) renew + file download. */
export function LicenceCard({ licence: l, accountName, learners, canIssue }: LicenceCardProps) {
  const t = useControlText();
  const fmt = useControlFormat();
  const toast = useToast();
  const renew = useRenewLicence();
  const file = useFetchLicenceFile();
  const state = STATE[l.state];

  return (
    <Card
      headingAs="h2"
      title={accountName}
      actions={
        <span className="flex flex-wrap gap-2">
          <Badge tone="brand">{t(EDITION_KEY[l.edition])}</Badge>
          <Badge tone={state.tone}>{t(state.key)}</Badge>
        </span>
      }
    >
      <div className="space-y-4">
        {learners ? (
          <Meter
            label={t("p05.learners")}
            value={learners.quantity}
            max={l.learnerCap}
            valueText={t("p05.learnersValue", {
              used: fmt.number(learners.quantity),
              cap: fmt.number(l.learnerCap),
            })}
          />
        ) : (
          <p className="text-body-sm text-text-secondary">
            {t("p05.learnerCap", { cap: fmt.number(l.learnerCap) })} · {t("p05.notReported")}
          </p>
        )}
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Fact label={t("p05.expires")}>
            {l.expiresAt ? fmt.date(l.expiresAt) : t("p05.perpetual")}
          </Fact>
          <Fact label={t("p05.supportEnds")}>{fmt.date(l.supportEndsAt)}</Fact>
          <Fact label={t("p05.grace")}>{t("p05.graceDays", { days: l.graceDays })}</Fact>
          <Fact label={t("p05.campuses")}>{fmt.number(l.campusCap)}</Fact>
          <Fact label={t("p02.catalogue.modules")}>
            {t("p05.modules", { count: l.modules.length })}
          </Fact>
          <Fact label={t("p05.signingKey")}>
            <span className="font-mono text-body-sm">{l.signingKeyId}</span>
          </Fact>
        </dl>
        <p className="text-body-sm text-text-secondary">
          {t(l.activation === "online" ? "p05.activation.online" : "p05.activation.offline")}
          {" · "}
          {t("p05.fingerprint")}{" "}
          <span className="font-mono break-all" dir="ltr">
            {l.fingerprint.slice(0, 16)}…
          </span>
        </p>
        {canIssue && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              aria-label={t("p05.renewLabel", { account: accountName })}
              disabled={renew.isPending || l.state === "revoked"}
              onClick={() =>
                renew.mutate(l.id, {
                  onSuccess: () => toast.show({ tone: "success", title: t("p05.renewed") }),
                  onError: () => toast.show({ tone: "danger", title: t("p05.renewFailed") }),
                })
              }
            >
              <RefreshCw className="me-1 h-4 w-4" aria-hidden="true" />
              {t("p05.renew")}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              aria-label={t("p05.downloadLabel", { account: accountName })}
              disabled={file.isPending}
              onClick={() =>
                file.mutate(l.id, {
                  onSuccess: (data) => downloadJson(`${l.id}.nexus-licence.json`, data),
                  onError: () => toast.show({ tone: "danger", title: t("p05.downloadFailed") }),
                })
              }
            >
              <Download className="me-1 h-4 w-4" aria-hidden="true" />
              {t("p05.download")}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
