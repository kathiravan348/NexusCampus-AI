import type { ConcessionKind, ConcessionMode, FeeRefundStatus } from "@nexus/contracts";
import {
  formatDate,
  formatMoney,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import {
  useConcessions,
  useFeeHeads,
  useFeePayments,
  useFeePlans,
  useFeeRefunds,
  useLocaleSettings,
} from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton, type BadgeProps } from "@nexus/ui-core";
import { useMemo } from "react";
import { useRuntime } from "../../app/TenantRuntime";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

const CONCESSION_KIND_KEY: Readonly<Record<ConcessionKind, MessageKey>> = {
  sibling: "m18.concessionKind.sibling",
  merit: "m18.concessionKind.merit",
  need_based: "m18.concessionKind.needBased",
  staff_child: "m18.concessionKind.staffChild",
  scholarship: "m18.concessionKind.scholarship",
  award_credit: "m18.concessionKind.awardCredit",
  other: "m18.concessionKind.other",
};

const CONCESSION_MODE_KEY: Readonly<Record<ConcessionMode, MessageKey>> = {
  percent: "m18.concessionMode.percent",
  fixed: "m18.concessionMode.fixed",
};

const REFUND_STATUS: Readonly<Record<FeeRefundStatus, readonly [MessageKey, BadgeTone]>> = {
  requested: ["m18.refundStatus.requested", "warning"],
  approved: ["m18.refundStatus.approved", "info"],
  paid: ["m18.refundStatus.paid", "success"],
  rejected: ["m18.refundStatus.rejected", "danger"],
};

/**
 * Staff-only overview of fee heads, plans, concessions and refunds.
 * Personal reason fields on concessions and refunds are intentionally omitted (V-7).
 */
export function PlansTab() {
  const t = useText();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const heads = useFeeHeads();
  const plans = useFeePlans();
  const concessions = useConcessions();
  const refunds = useFeeRefunds();
  const payments = useFeePayments();
  const localeSettings = useLocaleSettings();

  const headsById = useMemo(
    () => new Map((heads.data?.items ?? []).map((head) => [head.id, head])),
    [heads.data],
  );
  const plansById = useMemo(
    () => new Map((plans.data?.items ?? []).map((plan) => [plan.id, plan])),
    [plans.data],
  );
  const paymentCurrencies = useMemo(
    () => new Map((payments.data?.items ?? []).map((row) => [row.id, row.currency])),
    [payments.data],
  );

  const loading =
    (heads.isPending && !heads.data) ||
    (plans.isPending && !plans.data) ||
    (concessions.isPending && !concessions.data) ||
    (refunds.isPending && !refunds.data);
  const failed =
    (heads.isError && !heads.data) ||
    (plans.isError && !plans.data) ||
    (concessions.isError && !concessions.data) ||
    (refunds.isError && !refunds.data);

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-36 w-full" />
      </div>
    );
  }

  if (failed) {
    return (
      <EmptyState
        tone="error"
        title={t("m18.plans.error")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void heads.refetch();
              void plans.refetch();
              void concessions.refetch();
              void refunds.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const fallbackCurrency = localeSettings.data?.currency ?? plans.data?.items[0]?.currency ?? null;
  const formatBps = (bps: number) =>
    t("m18.plans.percentValue", {
      value: formatNumber(bps / 100, safeLocale, { maximumFractionDigits: 2 }),
    });

  const headList = heads.data?.items ?? [];
  const planList = plans.data?.items ?? [];
  const concessionList = concessions.data?.items ?? [];
  const refundList = refunds.data?.items ?? [];

  return (
    <div className="space-y-4">
      <Card title={t("m18.plans.headsTitle")}>
        {headList.length === 0 ? (
          <p className="text-body-sm text-text-muted">{t("m18.plans.headsEmpty")}</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {headList.map((head) => (
              <li
                key={head.id}
                className="min-w-0 space-y-1.5 rounded-md border border-border-default bg-bg-raised p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="break-words text-body font-medium text-text-primary">{head.name}</p>
                  <Badge tone="neutral">{head.code}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="info">
                    {t("m18.plans.taxRate", { rate: formatBps(head.taxRateBasisPoints) })}
                  </Badge>
                  <Badge tone={head.refundable ? "success" : "neutral"}>
                    {t(head.refundable ? "m18.plans.refundable" : "m18.plans.nonRefundable")}
                  </Badge>
                  <Badge tone={head.active ? "success" : "neutral"}>
                    {t(head.active ? "common.active" : "common.inactive")}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("m18.plans.plansTitle")}>
        {planList.length === 0 ? (
          <p className="text-body-sm text-text-muted">{t("m18.plans.plansEmpty")}</p>
        ) : (
          <div className="space-y-4">
            {planList.map((plan) => (
              <section
                key={plan.id}
                className="space-y-3 rounded-md border border-border-default bg-bg-raised p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="break-words text-body font-semibold text-text-primary">
                    {plan.name}
                  </h3>
                  <Badge tone="brand">{plan.currency}</Badge>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <h4 className="text-label uppercase text-text-muted rtl:tracking-normal">
                      {t("m18.plans.planLines")}
                    </h4>
                    <ul className="space-y-1">
                      {plan.lines.map((line) => (
                        <li
                          key={line.feeHeadId}
                          className="flex items-center justify-between gap-2 text-body-sm"
                        >
                          <span className="min-w-0 break-words text-text-primary">
                            {headsById.get(line.feeHeadId)?.name ?? line.feeHeadId}
                          </span>
                          <span className="shrink-0 font-mono text-number-sm text-text-secondary tabular-nums">
                            {formatMoney(line.amount, plan.currency, safeLocale)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-1.5">
                    <h4 className="text-label uppercase text-text-muted rtl:tracking-normal">
                      {t("m18.plans.instalments")}
                    </h4>
                    <ul className="space-y-1">
                      {plan.instalments.map((inst) => (
                        <li
                          key={inst.code}
                          className="flex flex-wrap items-center justify-between gap-2 text-body-sm"
                        >
                          <span className="font-mono text-number-sm text-text-primary">
                            {inst.code}
                          </span>
                          <span className="text-text-secondary">
                            {formatDate(inst.dueOn, { locale: safeLocale })}
                          </span>
                          <span className="font-mono text-number-sm text-text-secondary tabular-nums">
                            {formatBps(inst.sharePercentBasisPoints)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card title={t("m18.plans.concessionsTitle")}>
          {concessionList.length === 0 ? (
            <p className="text-body-sm text-text-muted">{t("m18.plans.concessionsEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {concessionList.map((concession) => {
                const planCurrency =
                  plansById.get(concession.feePlanId)?.currency ?? fallbackCurrency;
                const valueText =
                  concession.mode === "percent"
                    ? formatBps(concession.value)
                    : planCurrency
                      ? formatMoney(concession.value, planCurrency, safeLocale)
                      : formatNumber(concession.value, safeLocale);
                return (
                  <li
                    key={concession.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-default bg-bg-raised p-3"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="brand">{t(CONCESSION_KIND_KEY[concession.kind])}</Badge>
                      <Badge tone="neutral">{t(CONCESSION_MODE_KEY[concession.mode])}</Badge>
                    </div>
                    <span className="font-mono text-number-sm font-semibold text-text-primary tabular-nums">
                      {valueText}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title={t("m18.plans.refundsTitle")}>
          {refundList.length === 0 ? (
            <p className="text-body-sm text-text-muted">{t("m18.plans.refundsEmpty")}</p>
          ) : (
            <ul className="space-y-2">
              {refundList.map((refund) => {
                const [statusKey, statusTone] = REFUND_STATUS[refund.status];
                const currency = paymentCurrencies.get(refund.paymentId) ?? fallbackCurrency;
                return (
                  <li
                    key={refund.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-default bg-bg-raised p-3"
                  >
                    <span className="font-mono text-number-sm font-semibold text-text-primary tabular-nums">
                      {currency
                        ? formatMoney(refund.amount, currency, safeLocale)
                        : formatNumber(refund.amount, safeLocale)}
                    </span>
                    <Badge tone={statusTone}>{t(statusKey)}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
