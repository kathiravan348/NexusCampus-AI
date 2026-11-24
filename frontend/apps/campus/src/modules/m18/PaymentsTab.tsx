import type {
  FeeInvoice,
  FeePaymentInput,
  FeePaymentMethod,
  FeePaymentStatus,
} from "@nexus/contracts";
import {
  formatDateTime,
  formatMoney,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { useFeePayments, type PendingFeePayment } from "@nexus/services";
import { Badge, Button, EmptyState, Skeleton, type BadgeProps } from "@nexus/ui-core";
import { Receipt } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

export const PAYMENT_METHOD_KEY: Readonly<Record<FeePaymentMethod, MessageKey>> = {
  cash: "m18.method.cash",
  cheque: "m18.method.cheque",
  bank_transfer: "m18.method.bankTransfer",
  card: "m18.method.card",
  upi: "m18.method.upi",
  wallet: "m18.method.wallet",
  gateway: "m18.method.gateway",
};

/** Converts a major-unit decimal string into integer minor units (D9), or NaN when malformed. */
export function majorToMinor(raw: string, currency: string): number {
  const trimmed = raw.trim();
  if (trimmed === "") return Number.NaN;
  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat("en", { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2;
  } catch {
    digits = 2;
  }
  const pattern = digits === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`);
  if (!pattern.test(trimmed)) return Number.NaN;
  const [whole = "0", frac = ""] = trimmed.split(".");
  const minor = Number(whole) * 10 ** digits + Number(frac.padEnd(digits, "0"));
  return Number.isSafeInteger(minor) ? minor : Number.NaN;
}

export function defaultReceivedAtLocal(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const d = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  return `${d}T${p(now.getHours())}:${p(now.getMinutes())}`;
}

export function toUtcIso(value: string): string | null {
  const d = value.trim() ? new Date(value.trim()) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

export function makePaymentDefaults(
  firstInv: FeeInvoice | undefined,
  receivedAt: string,
): FeePaymentInput {
  return {
    invoiceIds: firstInv ? [firstInv.id] : [],
    currency: firstInv?.currency ?? "GBP",
    amount: Number.NaN,
    method: "cash",
    receivedAt,
    deviceId: null,
  };
}

export function groupOpenInvoices(
  openInvoices: readonly FeeInvoice[],
  learnerLabels: ReadonlyMap<string, string>,
) {
  const grouped = new Map<string, FeeInvoice[]>();
  for (const inv of openInvoices) {
    const list = grouped.get(inv.learnerId);
    if (list) list.push(inv);
    else grouped.set(inv.learnerId, [inv]);
  }
  return [...grouped.entries()].map(([learnerId, list]) => ({
    learnerId,
    label: learnerLabels.get(learnerId) ?? list[0]?.invoiceNumber ?? learnerId,
    invoices: list,
  }));
}

const PAYMENT_STATUS: Readonly<Record<FeePaymentStatus, readonly [MessageKey, BadgeTone]>> = {
  pending: ["m18.paymentStatus.pending", "warning"],
  succeeded: ["m18.paymentStatus.succeeded", "success"],
  failed: ["m18.paymentStatus.failed", "danger"],
  reversed: ["m18.paymentStatus.reversed", "neutral"],
};

export interface PaymentsTabProps {
  readonly pendingPayments?: readonly PendingFeePayment[];
}

/** Recorded fee payment receipts plus any offline-queued receipts waiting to sync. */
export function PaymentsTab({ pendingPayments = [] }: PaymentsTabProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const payments = useFeePayments();

  if (payments.isPending && !payments.data) {
    return (
      <div className="space-y-3" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (payments.isError && !payments.data) {
    return (
      <EmptyState
        tone="error"
        title={t("m18.payments.error")}
        action={
          <Button variant="secondary" onClick={() => void payments.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const items = payments.data?.items ?? [];
  if (items.length === 0 && pendingPayments.length === 0) {
    return (
      <EmptyState
        icon={<Receipt className="h-6 w-6" />}
        title={t("m18.payments.empty")}
        description={t("m18.payments.emptyBody")}
      />
    );
  }

  return (
    <ul aria-label={t("m18.payments.listLabel")} className="space-y-3">
      {pendingPayments.map((pending) => (
        <li
          key={pending.entryId}
          className="flex flex-col gap-2 rounded-lg border border-warning bg-warning-subtle p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="break-words text-body font-semibold text-text-primary">
                {t("m18.payments.pendingReceipt")}
              </p>
              <Badge tone="warning">{t("m18.payment.waitingToSync")}</Badge>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-secondary">
              <span>{t(PAYMENT_METHOD_KEY[pending.input.method])}</span>
              <span>
                {t("m18.payments.receivedAt", {
                  date: formatDateTime(pending.input.receivedAt, {
                    locale: safeLocale,
                    timeZone,
                  }),
                })}
              </span>
            </div>
          </div>
          <p className="shrink-0 font-mono text-number font-semibold text-text-primary tabular-nums">
            {formatMoney(pending.input.amount, pending.input.currency, safeLocale)}
          </p>
        </li>
      ))}

      {items.map((payment) => {
        const [statusKey, statusTone] = PAYMENT_STATUS[payment.status];
        return (
          <li
            key={payment.id}
            className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="break-words font-mono text-body font-semibold text-text-primary">
                  {payment.receiptNumber}
                </p>
                <Badge tone={statusTone}>{t(statusKey)}</Badge>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm text-text-secondary">
                <span>{t(PAYMENT_METHOD_KEY[payment.method])}</span>
                <span>
                  {t("m18.payments.receivedAt", {
                    date: formatDateTime(payment.receivedAt, {
                      locale: safeLocale,
                      timeZone,
                    }),
                  })}
                </span>
              </div>
            </div>
            <p className="shrink-0 font-mono text-number font-semibold text-text-primary tabular-nums">
              {formatMoney(payment.amount, payment.currency, safeLocale)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
