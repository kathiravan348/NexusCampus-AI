import { zodResolver } from "@hookform/resolvers/zod";
import { FeePaymentInputSchema, type FeeInvoice, type FeePaymentInput } from "@nexus/contracts";
import {
  formatDate,
  formatMoney,
  isKnownMessageKey,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
  type Translate,
} from "@nexus/i18n";
import { ApiRequestError, type useRecordFeePayment } from "@nexus/services";
import { Button, Checkbox, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, type UseFormSetError } from "react-hook-form";
import { useRuntime } from "../../app/TenantRuntime";
import { useLearnerNames } from "./InvoicesTab";
import {
  defaultReceivedAtLocal,
  groupOpenInvoices,
  majorToMinor,
  makePaymentDefaults,
  PAYMENT_METHOD_KEY,
  toUtcIso,
} from "./PaymentsTab";

export { majorToMinor };
const isOpen = (i: FeeInvoice) =>
  (i.status === "issued" || i.status === "part_paid") && i.total > i.paid;
const MANUAL_METHODS: readonly FeePaymentInput["method"][] = ["cash", "cheque", "bank_transfer"];
const SERVER_FIELD_KEYS: Readonly<Record<string, readonly [keyof FeePaymentInput, MessageKey]>> = {
  invoiceIds: ["invoiceIds", "m18.recordDialog.invalidInvoices"],
  currency: ["invoiceIds", "m18.recordDialog.currencyMismatch"],
  amount: ["amount", "m18.recordDialog.amountExceedsBalance"],
  method: ["method", "m18.recordDialog.invalidMethod"],
  receivedAt: ["receivedAt", "m18.recordDialog.invalidDate"],
};

function errText(
  err: { readonly message?: unknown } | undefined,
  fallback: MessageKey,
  t: Translate,
): string | undefined {
  if (!err) return undefined;
  return typeof err.message === "string" && isKnownMessageKey(err.message)
    ? t(err.message)
    : t(fallback);
}

function applyServerDetails(
  details: readonly { readonly path: string }[] | undefined,
  setError: UseFormSetError<FeePaymentInput>,
): void {
  let matched = false;
  for (const detail of details ?? []) {
    const mapped = SERVER_FIELD_KEYS[detail.path];
    if (!mapped) continue;
    setError(mapped[0], { type: "server", message: mapped[1] });
    matched = true;
  }
  if (!matched) setError("root", { type: "server", message: "m18.recordDialog.invalidRequest" });
}

export interface RecordPaymentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly online: boolean;
  readonly invoices: readonly FeeInvoice[];
  readonly recordPayment: ReturnType<typeof useRecordFeePayment>;
}

/** Modal form for recording a manual cash / cheque / bank-transfer receipt (M18, L2 offline). */
export function RecordPaymentDialog(props: RecordPaymentDialogProps) {
  const { open, onOpenChange, online, invoices, recordPayment } = props;
  const t = useText();
  const toast = useToast();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const learnerLabels = useLearnerNames(true);

  const openInvoices = useMemo(() => invoices.filter(isOpen), [invoices]);
  const learnerGroups = useMemo(
    () => groupOpenInvoices(openInvoices, learnerLabels),
    [learnerLabels, openInvoices],
  );
  const [selectedLearnerId, setSelectedLearnerId] = useState("");
  const [amountText, setAmountText] = useState("");
  const [receivedAtLocal, setReceivedAtLocal] = useState(() => defaultReceivedAtLocal());
  const form = useForm<FeePaymentInput>({
    resolver: zodResolver(FeePaymentInputSchema),
    defaultValues: makePaymentDefaults(undefined, new Date().toISOString()),
  });
  const { register, handleSubmit, reset, watch, setValue, setError } = form;
  const { errors } = form.formState;
  const wasOpen = useRef(false);
  useEffect(() => {
    const opening = open && !wasOpen.current;
    wasOpen.current = open;
    if (!opening) return;
    const nowLocal = defaultReceivedAtLocal();
    const firstGroup = learnerGroups[0];
    setSelectedLearnerId(firstGroup?.learnerId ?? "");
    setAmountText("");
    setReceivedAtLocal(nowLocal);
    const iso = toUtcIso(nowLocal) ?? new Date().toISOString();
    reset(makePaymentDefaults(firstGroup?.invoices[0], iso));
  }, [open, learnerGroups, reset]);

  const activeGroup =
    learnerGroups.find((group) => group.learnerId === selectedLearnerId) ?? learnerGroups[0];
  const learnerInvoices = activeGroup?.invoices ?? [];
  const selectedIds = watch("invoiceIds");
  const selectedInvoices = learnerInvoices.filter((inv) => selectedIds.includes(inv.id));
  const activeCurrency =
    selectedInvoices[0]?.currency ??
    learnerInvoices[0]?.currency ??
    openInvoices[0]?.currency ??
    "GBP";
  const selectedBalance = selectedInvoices.reduce((sum, inv) => sum + (inv.total - inv.paid), 0);
  const methodOptions = MANUAL_METHODS.map((m) => ({ value: m, label: t(PAYMENT_METHOD_KEY[m]) }));

  const syncAmount = (currency: string, raw = amountText) => {
    setValue("currency", currency);
    setValue("amount", majorToMinor(raw, currency), {
      shouldValidate: errors.amount !== undefined,
    });
  };
  const onLearnerChange = (nextLearnerId: string) => {
    setSelectedLearnerId(nextLearnerId);
    const firstInv = learnerGroups.find((row) => row.learnerId === nextLearnerId)?.invoices[0];
    setValue("invoiceIds", firstInv ? [firstInv.id] : [], { shouldValidate: true });
    syncAmount(firstInv?.currency ?? activeCurrency);
  };
  const toggleInvoice = (invoiceId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...selectedIds, invoiceId])]
      : selectedIds.filter((id) => id !== invoiceId);
    setValue("invoiceIds", next, { shouldValidate: true });
    const nextFirst = learnerInvoices.find((inv) => next.includes(inv.id));
    if (nextFirst) syncAmount(nextFirst.currency);
  };

  const onSubmit = handleSubmit(async (data) => {
    if (new Set(selectedInvoices.map((inv) => inv.currency)).size > 1) {
      setError("invoiceIds", { type: "validate", message: "m18.recordDialog.currencyMismatch" });
      return;
    }
    if (selectedInvoices.length > 0 && data.amount > selectedBalance) {
      setError("amount", { type: "validate", message: "m18.recordDialog.amountExceedsBalance" });
      return;
    }
    try {
      const result = await recordPayment.mutateAsync({ ...data, deviceId: null });
      toast.show({
        tone: result.queued ? "info" : "success",
        title: t(result.queued ? "m18.payment.queuedToast" : "m18.recordDialog.created"),
      });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.error.code === "invalid_request") {
        applyServerDetails(error.error.details, setError);
      } else {
        setError("root", { type: "server", message: "m18.recordDialog.saveFailed" });
        toast.show({ tone: "danger", title: t("m18.recordDialog.saveFailed") });
      }
    }
  });

  const invoiceErr = errText(errors.invoiceIds, "m18.recordDialog.invoicesRequired", t);
  const amountFb: MessageKey =
    amountText.trim() === "" ? "common.required" : "m18.recordDialog.amountInvalid";
  const dateFb: MessageKey =
    receivedAtLocal.trim() === "" ? "common.required" : "m18.recordDialog.invalidDate";
  const rootErr = errText(errors.root, "m18.recordDialog.invalidRequest", t);
  const balText = formatMoney(selectedBalance, activeCurrency, safeLocale);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("m18.recordDialog.title")}
      description={t("m18.recordDialog.description")}
      footer={
        <>
          {!online && (
            <p role="status" className="me-auto text-body-sm text-text-secondary">
              {t("m18.recordDialog.offlineHint")}
            </p>
          )}
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="m18-record-payment-form"
            loading={recordPayment.isPending}
            disabled={openInvoices.length === 0}
          >
            {t("m18.recordDialog.submit")}
          </Button>
        </>
      }
    >
      {openInvoices.length === 0 ? (
        <p className="text-body-sm text-text-muted">{t("m18.recordDialog.noOpenInvoices")}</p>
      ) : (
        <form
          id="m18-record-payment-form"
          onSubmit={(event) => void onSubmit(event)}
          noValidate
          className="space-y-4"
        >
          {rootErr && (
            <p
              role="alert"
              className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm font-medium text-danger-text"
            >
              {rootErr}
            </p>
          )}
          <Select
            label={t("m18.recordDialog.learner")}
            required
            value={activeGroup?.learnerId ?? ""}
            options={learnerGroups.map((g) => ({ value: g.learnerId, label: g.label }))}
            onChange={(event) => onLearnerChange(event.target.value)}
          />
          <fieldset className="space-y-2" aria-describedby={invoiceErr ? "m18-inv" : undefined}>
            <legend className="text-label font-sans font-semibold text-text-primary rtl:tracking-normal">
              {t("m18.recordDialog.invoices")}
            </legend>
            <div className="space-y-2">
              {learnerInvoices.map((inv) => {
                const due = formatDate(inv.dueOn, { locale: safeLocale });
                const bal = formatMoney(inv.total - inv.paid, inv.currency, safeLocale);
                return (
                  <Checkbox
                    key={inv.id}
                    label={`${inv.invoiceNumber} · ${due} · ${bal}`}
                    checked={selectedIds.includes(inv.id)}
                    onCheckedChange={(checked) => toggleInvoice(inv.id, checked === true)}
                  />
                );
              })}
            </div>
            {selectedInvoices.length > 0 && (
              <p className="font-mono text-number-sm text-text-secondary tabular-nums">
                {t("m18.recordDialog.selectedBalance", { amount: balText })}
              </p>
            )}
            {invoiceErr && (
              <p id="m18-inv" role="alert" className="text-body-sm text-danger-text">
                {invoiceErr}
              </p>
            )}
          </fieldset>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              type="text"
              inputMode="decimal"
              numeric
              required
              label={t("m18.recordDialog.amount", { currency: activeCurrency })}
              value={amountText}
              error={errText(errors.amount, amountFb, t)}
              onChange={(event) => {
                setAmountText(event.target.value);
                syncAmount(activeCurrency, event.target.value);
              }}
            />
            <Select
              label={t("m18.recordDialog.method")}
              required
              options={methodOptions}
              error={errText(errors.method, "m18.recordDialog.invalidMethod", t)}
              {...register("method")}
            />
          </div>
          <Input
            type="datetime-local"
            required
            label={t("m18.recordDialog.receivedAt")}
            value={receivedAtLocal}
            error={errText(errors.receivedAt, dateFb, t)}
            onChange={(event) => {
              setReceivedAtLocal(event.target.value);
              setValue("receivedAt", toUtcIso(event.target.value) ?? "", {
                shouldValidate: errors.receivedAt !== undefined,
              });
            }}
          />
        </form>
      )}
    </Modal>
  );
}
