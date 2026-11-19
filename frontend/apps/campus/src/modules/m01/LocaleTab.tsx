import { zodResolver } from "@hookform/resolvers/zod";
import { LocaleSettingsSchema, type Institution, type LocaleSettings } from "@nexus/contracts";
import { formatDateTime, formatMoney, formatNumber, useText } from "@nexus/i18n";
import { useLocaleSettings, useUpdateLocaleSettings } from "@nexus/services";
import { Button, Card, Checkbox, EmptyState, Select, Skeleton, useToast } from "@nexus/ui-core";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import {
  applyServerErrors,
  COMMON_COUNTRIES,
  COMMON_CURRENCIES,
  COMMON_LOCALES,
  COMMON_TIME_ZONES,
  WEEKDAY_KEYS,
  withExtras,
} from "./formErrors";
import { localeName } from "../../app/LocaleSwitch";
import { useRuntime } from "../../app/TenantRuntime";

export interface LocaleTabProps {
  readonly institution: Institution;
  readonly online: boolean;
}

function safePreview(values: LocaleSettings) {
  try {
    const now = new Date();
    return {
      date: formatDateTime(now, { locale: values.defaultLocale, timeZone: values.timeZone }),
      number: formatNumber(123456.78, values.defaultLocale),
      money: formatMoney(123456, values.currency, values.defaultLocale),
    };
  } catch {
    return null;
  }
}

/** Locale, time zone, currency, country, weekend days and a live format preview (M01, G-1, G-2). */
export function LocaleTab({ institution, online }: LocaleTabProps) {
  const t = useText();
  const toast = useToast();
  const { locale: uiLocale } = useRuntime();
  const settings = useLocaleSettings(institution.id);
  const updateLocale = useUpdateLocaleSettings(institution.id);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    setError,
    formState: { errors },
  } = useForm<LocaleSettings>({
    resolver: zodResolver(LocaleSettingsSchema),
    defaultValues: institution.locale,
  });

  useEffect(() => {
    if (settings.data) reset(settings.data);
  }, [settings.data, reset]);

  const current = watch();
  const localeChoices = useMemo(
    () =>
      withExtras(COMMON_LOCALES, [
        institution.locale.defaultLocale,
        ...institution.locale.supportedLocales,
        ...(settings.data?.supportedLocales ?? []),
      ]),
    [institution.locale, settings.data],
  );
  const localeOptions = useMemo(
    () =>
      localeChoices.map((code) => ({
        value: code,
        label: `${localeName(code, uiLocale)} (${code})`,
      })),
    [localeChoices, uiLocale],
  );
  const timeZoneOptions = useMemo(
    () =>
      withExtras(COMMON_TIME_ZONES, [institution.locale.timeZone, settings.data?.timeZone]).map(
        (tz) => ({ value: tz, label: tz }),
      ),
    [institution.locale.timeZone, settings.data?.timeZone],
  );
  const currencyOptions = useMemo(
    () =>
      withExtras(COMMON_CURRENCIES, [institution.locale.currency, settings.data?.currency]).map(
        (code) => ({ value: code, label: code }),
      ),
    [institution.locale.currency, settings.data?.currency],
  );
  const countryOptions = useMemo(
    () =>
      withExtras(COMMON_COUNTRIES, [institution.locale.country, settings.data?.country]).map(
        (code) => ({ value: code, label: code }),
      ),
    [institution.locale.country, settings.data?.country],
  );

  if (settings.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (settings.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m01.locale.error")}
        action={
          <Button variant="secondary" onClick={() => void settings.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const toggleLocale = (code: string, checked: boolean) => {
    const next = checked
      ? [...current.supportedLocales, code]
      : current.supportedLocales.filter((c) => c !== code);
    setValue("supportedLocales", next, { shouldValidate: true, shouldDirty: true });
  };

  const toggleWeekend = (day: number, checked: boolean) => {
    const next = checked
      ? [...current.weekendDays, day]
      : current.weekendDays.filter((d) => d !== day);
    setValue("weekendDays", next, { shouldValidate: true, shouldDirty: true });
  };

  const defaultLocaleField = register("defaultLocale");
  const preview = safePreview(current);

  const onSubmit = handleSubmit(async (data) => {
    try {
      await updateLocale.mutateAsync(data);
      toast.show({ tone: "success", title: t("m01.locale.saved") });
    } catch (error) {
      if (!applyServerErrors(error, setError)) {
        toast.show({ tone: "danger", title: t("m01.setup.saveFailed") });
      }
    }
  });

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <Card title={t("m01.locale.heading")} className="lg:col-span-2">
        <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label={t("m01.locale.defaultLocale")}
              options={localeOptions}
              error={errors.defaultLocale?.message}
              {...defaultLocaleField}
              onChange={(event) => {
                void defaultLocaleField.onChange(event);
                const picked = event.target.value;
                if (!current.supportedLocales.includes(picked)) {
                  setValue("supportedLocales", [...current.supportedLocales, picked], {
                    shouldValidate: true,
                  });
                }
              }}
            />
            <Select
              label={t("m01.locale.timeZone")}
              options={timeZoneOptions}
              error={errors.timeZone?.message}
              {...register("timeZone")}
            />
            <Select
              label={t("m01.locale.currency")}
              options={currencyOptions}
              error={errors.currency?.message}
              {...register("currency")}
            />
            <Select
              label={t("m01.locale.country")}
              options={countryOptions}
              error={errors.country?.message}
              {...register("country")}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-label font-semibold text-text-primary rtl:tracking-normal">
              {t("m01.locale.supportedLocales")}
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {localeChoices.map((code) => (
                <Checkbox
                  key={code}
                  label={`${localeName(code, uiLocale)} (${code})`}
                  checked={current.supportedLocales.includes(code)}
                  onCheckedChange={(state) => toggleLocale(code, state === true)}
                />
              ))}
            </div>
            {(errors.supportedLocales?.message ?? errors.supportedLocales?.root?.message) && (
              <p className="text-body-sm text-danger-text" role="alert">
                {errors.supportedLocales?.message ?? errors.supportedLocales?.root?.message}
              </p>
            )}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-label font-semibold text-text-primary rtl:tracking-normal">
              {t("m01.locale.weekendDays")}
            </legend>
            <div className="flex flex-wrap gap-4">
              {WEEKDAY_KEYS.map((key, day) => (
                <Checkbox
                  key={key}
                  label={t(key)}
                  checked={current.weekendDays.includes(day)}
                  onCheckedChange={(state) => toggleWeekend(day, state === true)}
                />
              ))}
            </div>
            {(errors.weekendDays?.message ?? errors.weekendDays?.root?.message) && (
              <p className="text-body-sm text-danger-text" role="alert">
                {errors.weekendDays?.message ?? errors.weekendDays?.root?.message}
              </p>
            )}
          </fieldset>

          <div className="flex justify-end">
            <Button type="submit" loading={updateLocale.isPending} disabled={!online}>
              {t("common.save")}
            </Button>
          </div>
        </form>
      </Card>

      <Card title={t("m01.locale.previewHeading")} className="h-fit">
        {preview && (
          <dl className="space-y-4">
            <div>
              <dt className="text-label font-semibold text-text-muted">
                {t("m01.locale.previewDate")}
              </dt>
              <dd data-testid="preview-date" className="mt-1 text-body text-text-primary">
                {preview.date}
              </dd>
            </div>
            <div>
              <dt className="text-label font-semibold text-text-muted">
                {t("m01.locale.previewNumber")}
              </dt>
              <dd
                data-testid="preview-number"
                className="mt-1 font-mono text-body text-text-primary"
              >
                {preview.number}
              </dd>
            </div>
            <div>
              <dt className="text-label font-semibold text-text-muted">
                {t("m01.locale.previewMoney")}
              </dt>
              <dd
                data-testid="preview-money"
                className="mt-1 font-mono text-body text-text-primary"
              >
                {preview.money}
              </dd>
            </div>
          </dl>
        )}
      </Card>
    </div>
  );
}
