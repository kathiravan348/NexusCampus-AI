import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { useCompliancePacks } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { Scale } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";
import { PACK_KEY } from "./privacyShared";

/** The regional compliance packs that apply: deadlines, minors' age, guardian consent, retention. */
export function ComplianceTab() {
  const t = useText();
  const { locale } = useRuntime();
  const packs = useCompliancePacks();
  const num = (n: number) => formatNumber(n, isPseudoLocale(locale) ? SOURCE_LOCALE : locale);

  if (packs.isPending) return <Skeleton className="h-48 w-full" />;
  if (packs.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m06.privacy.error")}
        action={
          <Button variant="secondary" onClick={() => void packs.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (packs.data.items.length === 0) {
    return <EmptyState icon={<Scale className="h-6 w-6" />} title={t("m06.compliance.empty")} />;
  }

  const yesNo = (v: boolean) => (
    <Badge tone={v ? "info" : "neutral"}>
      {t(v ? "m06.compliance.required" : "m06.compliance.notRequired")}
    </Badge>
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {packs.data.items.map((p) => (
        <Card key={p.code} title={t(PACK_KEY[p.code])}>
          <dl className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 text-body-sm">
            <dt className="text-text-secondary">{t("m06.compliance.dsrDueDays")}</dt>
            <dd className="font-mono tabular-nums">
              {t("m06.compliance.days", { count: p.dsrDueDays, days: num(p.dsrDueDays) })}
            </dd>
            <dt className="text-text-secondary">{t("m06.compliance.minorAge")}</dt>
            <dd className="font-mono tabular-nums">{num(p.minorAgeThreshold)}</dd>
            <dt className="text-text-secondary">{t("m06.compliance.guardianAi")}</dt>
            <dd>{yesNo(p.guardianConsentForAi)}</dd>
            <dt className="text-text-secondary">{t("m06.compliance.guardianMedia")}</dt>
            <dd>{yesNo(p.guardianConsentForMedia)}</dd>
            <dt className="text-text-secondary">{t("m06.compliance.retention")}</dt>
            <dd className="font-mono tabular-nums">
              {t("m06.compliance.days", {
                count: p.retentionDaysDefault,
                days: num(p.retentionDaysDefault),
              })}
            </dd>
          </dl>
        </Card>
      ))}
    </div>
  );
}
