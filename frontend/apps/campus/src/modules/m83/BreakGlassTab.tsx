import { useText } from "@nexus/i18n";
import { useBreakGlassNotices } from "@nexus/services";
import { Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { ShieldCheck, Siren } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";
import { CATEGORY_KEY, when } from "./vaultShared";

/** Emergency provider access notices (V-5): two approvers, when it happened, when you were told, the report. */
export function BreakGlassTab() {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const notices = useBreakGlassNotices();

  if (notices.isPending) return <Skeleton className="h-32 w-full" />;
  if (notices.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m83.vault.error")}
        action={
          <Button variant="secondary" onClick={() => void notices.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (notices.data.items.length === 0) {
    return (
      <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title={t("m83.breakGlass.empty")} />
    );
  }

  return (
    <div className="space-y-4">
      {notices.data.items.map((n) => (
        <Card key={n.id} title={t(CATEGORY_KEY[n.category])}>
          <div className="space-y-2 text-body-sm">
            <p className="flex items-center gap-2 font-medium text-danger-text">
              <Siren className="h-4 w-4" aria-hidden="true" />
              {t("m83.breakGlass.explain")}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-text-muted">{t("m83.breakGlass.approvers")}</dt>
              <dd className="font-mono">{n.approverRefs.join(" · ")}</dd>
              <dt className="text-text-muted">{t("m83.breakGlass.occurred")}</dt>
              <dd className="font-mono tabular-nums">{when(n.occurredAt, locale, timeZone)}</dd>
              <dt className="text-text-muted">{t("m83.breakGlass.notified")}</dt>
              <dd className="font-mono tabular-nums">{when(n.notifiedAt, locale, timeZone)}</dd>
            </dl>
            {n.reportUrl ? (
              <a
                href={n.reportUrl}
                target="_blank"
                rel="noreferrer"
                className="text-brand-primary-text underline-offset-2 hover:underline"
              >
                {t("m83.breakGlass.report")}
              </a>
            ) : (
              <p className="text-text-muted">{t("m83.breakGlass.reportPending")}</p>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
