import { FeeInvoiceStatusSchema, type FeeInvoiceStatus } from "@nexus/contracts";
import {
  formatDate,
  formatMoney,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { ApiRequestError, useFeeInvoices, useLearners, usePeople } from "@nexus/services";
import { Badge, Button, EmptyState, Select, Skeleton, type BadgeProps } from "@nexus/ui-core";
import { ChevronDown, ChevronUp, Receipt } from "lucide-react";
import { useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

const INVOICE_STATUS: Readonly<Record<FeeInvoiceStatus, readonly [MessageKey, BadgeTone]>> = {
  draft: ["m18.invoiceStatus.draft", "neutral"],
  issued: ["m18.invoiceStatus.issued", "info"],
  part_paid: ["m18.invoiceStatus.partPaid", "warning"],
  paid: ["m18.invoiceStatus.paid", "success"],
  void: ["m18.invoiceStatus.void", "neutral"],
  written_off: ["m18.invoiceStatus.writtenOff", "danger"],
};

export interface InvoicesTabProps {
  readonly pendingInvoiceIds?: ReadonlySet<string>;
}

/** Resolves learner display names from `/learners` + `/people` (omits entries when unavailable). */
export function useLearnerNames(fallbackToNumber = false): ReadonlyMap<string, string> {
  const learners = useLearners();
  const people = usePeople();
  return useMemo(() => {
    const personNames = new Map<string, string>();
    if (!people.isError) {
      for (const person of people.data?.items ?? []) {
        personNames.set(person.id, person.preferredName || person.legalName);
      }
    }
    const map = new Map<string, string>();
    if (!learners.isError) {
      for (const learner of learners.data?.items ?? []) {
        const label =
          personNames.get(learner.personId) ?? (fallbackToNumber ? learner.learnerNumber : "");
        if (label) map.set(learner.id, label);
      }
    }
    return map;
  }, [fallbackToNumber, learners.data, learners.isError, people.data, people.isError]);
}

/** Fee invoices list with status filter, formatted totals, status badges and expandable lines. */
export function InvoicesTab({ pendingInvoiceIds }: InvoicesTabProps) {
  const t = useText();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const [status, setStatus] = useState<FeeInvoiceStatus | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const invoices = useFeeInvoices(null, status);
  const learnerNames = useLearnerNames();

  const statusOptions = [
    { value: "", label: t("m18.invoices.allStatuses") },
    ...FeeInvoiceStatusSchema.options.map((value) => ({
      value,
      label: t(INVOICE_STATUS[value][0]),
    })),
  ];

  const items = invoices.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="max-w-xs">
        <Select
          label={t("m18.invoices.filterStatus")}
          options={statusOptions}
          value={status ?? ""}
          onChange={(event) => {
            setExpandedId(null);
            setStatus(FeeInvoiceStatusSchema.safeParse(event.target.value).data ?? null);
          }}
        />
      </div>

      {invoices.isPending && !invoices.data ? (
        <div className="space-y-3" role="status" aria-label={t("common.loading")}>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : invoices.isError && !invoices.data ? (
        <EmptyState
          tone="error"
          title={t(
            invoices.error instanceof ApiRequestError &&
              (invoices.error.status === 403 || invoices.error.error.code === "module_disabled")
              ? "common.shell.forbiddenTitle"
              : "m18.invoices.error",
          )}
          action={
            <Button variant="secondary" onClick={() => void invoices.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6" />}
          title={t("m18.invoices.empty")}
          description={t("m18.invoices.emptyBody")}
        />
      ) : (
        <ul aria-label={t("m18.invoices.listLabel")} className="space-y-3">
          {items.map((invoice) => {
            const open = expandedId === invoice.id;
            const linesId = `invoice-lines-${invoice.id}`;
            const [statusKey, statusTone] = INVOICE_STATUS[invoice.status];
            const learnerName = learnerNames.get(invoice.learnerId);
            const balance = invoice.total - invoice.paid;
            const waiting = pendingInvoiceIds?.has(invoice.id) ?? false;

            return (
              <li
                key={invoice.id}
                className="min-w-0 rounded-lg border border-border-default bg-bg-surface p-4"
              >
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={linesId}
                  onClick={() => setExpandedId(open ? null : invoice.id)}
                  className="flex w-full flex-col gap-3 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 space-y-0.5">
                      <p className="break-words font-mono text-body font-semibold text-text-primary">
                        {invoice.invoiceNumber}
                      </p>
                      {learnerName && (
                        <p className="break-words text-body-sm text-text-secondary">
                          {learnerName}
                        </p>
                      )}
                      <p className="text-body-sm text-text-muted">
                        {t("m18.invoices.dueOn", {
                          date: formatDate(invoice.dueOn, { locale: safeLocale }),
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={statusTone}>{t(statusKey)}</Badge>
                      {waiting && <Badge tone="warning">{t("m18.payment.waitingToSync")}</Badge>}
                      <span className="inline-flex items-center gap-1 text-body-sm text-brand-primary-text">
                        {t(open ? "m18.invoices.hideLines" : "m18.invoices.showLines")}
                        {open ? (
                          <ChevronUp className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="h-4 w-4" aria-hidden="true" />
                        )}
                      </span>
                    </div>
                  </div>

                  <dl className="grid grid-cols-1 gap-2 border-t border-border-default pt-3 sm:grid-cols-3">
                    <div>
                      <dt className="text-label uppercase text-text-muted rtl:tracking-normal">
                        {t("m18.invoices.total")}
                      </dt>
                      <dd className="font-mono text-number-sm text-text-primary tabular-nums">
                        {formatMoney(invoice.total, invoice.currency, safeLocale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-label uppercase text-text-muted rtl:tracking-normal">
                        {t("m18.invoices.paid")}
                      </dt>
                      <dd className="font-mono text-number-sm text-text-primary tabular-nums">
                        {formatMoney(invoice.paid, invoice.currency, safeLocale)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-label uppercase text-text-muted rtl:tracking-normal">
                        {t("m18.invoices.balance")}
                      </dt>
                      <dd className="font-mono text-number-sm font-semibold text-text-primary tabular-nums">
                        {formatMoney(balance, invoice.currency, safeLocale)}
                      </dd>
                    </div>
                  </dl>
                </button>

                {open && (
                  <div id={linesId} className="mt-3 space-y-2 border-t border-border-default pt-3">
                    <h3 className="text-label uppercase text-text-muted rtl:tracking-normal">
                      {t("m18.invoices.linesHeading")}
                    </h3>
                    <ul className="space-y-2">
                      {invoice.lines.map((line, index) => {
                        const net = line.amount - line.discount + line.tax;
                        return (
                          <li
                            key={`${line.feeHeadId}-${index}`}
                            className="flex flex-col gap-1 rounded-md border border-border-default bg-bg-raised p-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <p className="break-words text-body-sm font-medium text-text-primary">
                                {line.description}
                              </p>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-number-sm text-text-secondary tabular-nums">
                                <span>
                                  {t("m18.invoices.lineAmount", {
                                    amount: formatMoney(line.amount, invoice.currency, safeLocale),
                                  })}
                                </span>
                                {line.discount > 0 && (
                                  <span>
                                    {t("m18.invoices.lineDiscount", {
                                      amount: formatMoney(
                                        line.discount,
                                        invoice.currency,
                                        safeLocale,
                                      ),
                                    })}
                                  </span>
                                )}
                                {line.tax > 0 && (
                                  <span>
                                    {t("m18.invoices.lineTax", {
                                      amount: formatMoney(line.tax, invoice.currency, safeLocale),
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                            <p className="shrink-0 font-mono text-number-sm font-semibold text-text-primary tabular-nums">
                              {formatMoney(net, invoice.currency, safeLocale)}
                            </p>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
