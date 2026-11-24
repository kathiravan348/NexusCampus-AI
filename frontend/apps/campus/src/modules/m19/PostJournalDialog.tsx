import { JournalEntryInputSchema, type LedgerAccount } from "@nexus/contracts";
import { formatMoney, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useCreateJournalEntry,
  useLocaleSettings,
  useTenant,
} from "@nexus/services";
import { Button, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useRuntime } from "../../app/TenantRuntime";

type Line = { accountId: string; debit: string; credit: string };
type Form = { postedOn: string; reference: string; currency: string; lines: Line[] };
const blankLine = (): Line => ({ accountId: "", debit: "", credit: "" });

function amountFor(value: string, digits: number) {
  if (value === "") return 0;
  if (!/^\d+(?:\.\d+)?$/.test(value)) return undefined;
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > digits) return undefined;
  const minor = Number(`${whole}${fraction.padEnd(digits, "0")}`);
  return Number.isSafeInteger(minor) ? minor : undefined;
}

function todayAt(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

interface Props {
  readonly accounts: readonly LedgerAccount[];
  readonly online: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

export function PostJournalDialog({ accounts, online, onOpenChange }: Props) {
  const t = useText();
  const toast = useToast();
  const { locale } = useRuntime();
  const local = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const tenant = useTenant();
  const [selected, setSelected] = useState<string>();
  const institutions = tenant.data?.institutions ?? [];
  const institutionId = selected ?? institutions[0]?.id ?? null;
  const settings = useLocaleSettings(institutionId);
  const create = useCreateJournalEntry();
  const { register, watch, control, handleSubmit, reset, formState, setError } = useForm<Form>({
    defaultValues: { postedOn: "", reference: "", currency: "", lines: [blankLine(), blankLine()] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });
  const settingCurrency = settings.data?.currency;
  const settingZone = settings.data?.timeZone;
  useEffect(() => {
    if (settingCurrency && settingZone) {
      reset({
        postedOn: todayAt(settingZone),
        reference: "",
        currency: settingCurrency,
        lines: [blankLine(), blankLine()],
      });
    }
  }, [settingCurrency, settingZone, institutionId, reset]);

  const values = watch();
  const currency = values.currency.trim().toUpperCase();
  const validCurrency = /^[A-Z]{3}$/.test(currency);
  const digits = validCurrency
    ? (new Intl.NumberFormat(local, { style: "currency", currency }).resolvedOptions()
        .maximumFractionDigits ?? 2)
    : 0;
  const options = accounts
    .filter((a) => a.institutionId === institutionId && a.active)
    .map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));
  const lines = values.lines.map((l) => ({
    accountId: l.accountId,
    debit: amountFor(l.debit, digits),
    credit: amountFor(l.credit, digits),
  }));
  const debit = lines.reduce((sum, l) => sum + (l.debit ?? 0), 0);
  const credit = lines.reduce((sum, l) => sum + (l.credit ?? 0), 0);
  const validKinds = lines.every(
    (l) => l.debit !== undefined && l.credit !== undefined && l.debit > 0 !== l.credit > 0,
  );
  const hasAnyAmount = values.lines.some((l) => l.debit !== "" || l.credit !== "");
  const validAmounts =
    validKinds && debit === credit && Number.isSafeInteger(debit) && Number.isSafeInteger(credit);
  const payload = JournalEntryInputSchema.safeParse({ ...values, institutionId, currency, lines });
  const canPost =
    !!institutionId &&
    !!settingCurrency &&
    validCurrency &&
    validAmounts &&
    payload.success &&
    options.length > 0 &&
    lines.every((l) => options.some((a) => a.value === l.accountId));

  const submit = handleSubmit(async () => {
    if (!canPost || !payload.success || !online || create.isPending) return;
    try {
      await create.mutateAsync(payload.data);
      toast.show({ tone: "success", title: t("m19.post.success") });
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiRequestError && e.error.details?.some((d) => d.path === "lines")) {
        setError("root.lines", { message: "m19.post.lineError" });
      } else {
        setError("root.request", { message: "m19.post.failed" });
      }
    }
  });

  return (
    <Modal
      open
      size="lg"
      onOpenChange={onOpenChange}
      title={t("m19.journal.postEntry")}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="post-journal"
            disabled={!online || !canPost}
            loading={create.isPending}
          >
            {t("m19.post.submit")}
          </Button>
        </>
      }
    >
      <form id="post-journal" onSubmit={(e) => void submit(e)} className="space-y-4">
        {institutions.length > 1 && (
          <Select
            label={t("m19.post.institution")}
            value={institutionId ?? ""}
            options={institutions.map((i) => ({ value: i.id, label: i.name }))}
            onChange={(event) => setSelected(event.target.value)}
          />
        )}
        {settings.isError || tenant.isError ? <p role="alert">{t("m19.post.failed")}</p> : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Input label={t("m19.post.postedOn")} type="date" required {...register("postedOn")} />
          <Input
            label={t("m19.post.reference")}
            required
            maxLength={60}
            {...register("reference")}
          />
          <Input
            label={t("m19.post.currency")}
            required
            maxLength={3}
            {...register("currency")}
            error={
              values.currency.length > 0 && !validCurrency ? t("m19.post.currencyErr") : undefined
            }
          />
        </div>
        {fields.map((field, index) => (
          <fieldset
            key={field.id}
            className="grid gap-2 rounded-md border border-border-default p-3 sm:grid-cols-3"
          >
            <legend className="font-semibold">{t("m19.line.label", { ordinal: index + 1 })}</legend>
            <Select
              label={t("m19.line.account")}
              required
              placeholder={t("common.selectOption")}
              options={options}
              {...register(`lines.${index}.accountId`)}
            />
            <Input
              label={t("m19.line.debit")}
              inputMode="decimal"
              {...register(`lines.${index}.debit`)}
            />
            <Input
              label={t("m19.line.credit")}
              inputMode="decimal"
              {...register(`lines.${index}.credit`)}
            />
            {fields.length > 2 && (
              <Button type="button" variant="secondary" onClick={() => remove(index)}>
                {t("m19.post.removeLine")}
              </Button>
            )}
          </fieldset>
        ))}
        {fields.length < 20 && (
          <Button type="button" variant="secondary" onClick={() => append(blankLine())}>
            {t("m19.post.addLine")}
          </Button>
        )}
        {validCurrency && (
          <div className="space-y-1" aria-live="polite">
            {Number.isSafeInteger(debit) && (
              <p>
                {t("m19.journal.totalDebit")} · {formatMoney(debit, currency, local)}
              </p>
            )}
            {Number.isSafeInteger(credit) && (
              <p>
                {t("m19.journal.totalCredit")} · {formatMoney(credit, currency, local)}
              </p>
            )}
          </div>
        )}
        {hasAnyAmount && !validAmounts && <p role="alert">{t("m19.post.balanceError")}</p>}
        {formState.errors.root?.["lines"] && <p role="alert">{t("m19.post.lineError")}</p>}
        {formState.errors.root?.["request"] && <p role="alert">{t("m19.post.failed")}</p>}
        {!online && <p role="status">{t("common.offline")}</p>}
      </form>
    </Modal>
  );
}
