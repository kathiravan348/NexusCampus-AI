import { zodResolver } from "@hookform/resolvers/zod";
import {
  AcademicCalendarSchema,
  AcademicPeriodKindSchema,
  DisplayCalendarSchema,
  type AcademicCalendar,
  type AcademicPeriodKind,
  type Institution,
} from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { useCalendars, useSaveCalendar } from "@nexus/services";
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  Select,
  Skeleton,
  useToast,
} from "@nexus/ui-core";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useRuntime } from "../../app/TenantRuntime";
import { CalendarHolidaysCard } from "./CalendarHolidaysCard";
import { applyServerErrors, DISPLAY_CALENDAR_KEY } from "./formErrors";

const PERIOD_KIND_KEY: Readonly<Record<AcademicPeriodKind, MessageKey>> = {
  term: "m01.calendar.kind.term",
  semester: "m01.calendar.kind.semester",
  trimester: "m01.calendar.kind.trimester",
  session: "m01.calendar.kind.session",
  block: "m01.calendar.kind.block",
};

export interface CalendarTabProps {
  readonly institution: Institution;
  readonly online: boolean;
}

function previewDisplayDate(
  startsOn: string | undefined,
  calendar: AcademicCalendar["displayCalendar"] | undefined,
  locale: string,
): string | null {
  if (!startsOn || !calendar) return null;
  try {
    return formatDate(startsOn, {
      locale: isPseudoLocale(locale) ? SOURCE_LOCALE : locale,
      calendar,
    });
  } catch {
    return null;
  }
}

/** Academic year range, periods, holidays and display calendar (M01, G-3). */
export function CalendarTab({ institution, online }: CalendarTabProps) {
  const t = useText();
  const toast = useToast();
  const { locale } = useRuntime();
  const calendars = useCalendars(institution.id);
  const saveCalendar = useSaveCalendar(institution.id);
  const active = calendars.data?.items[0] ?? null;

  const {
    register,
    control,
    handleSubmit,
    reset,
    watch,
    setError,
    formState: { errors },
  } = useForm<AcademicCalendar>({ resolver: zodResolver(AcademicCalendarSchema) });

  const periods = useFieldArray({ control, name: "periods", keyName: "fieldKey" });
  const holidays = useFieldArray({ control, name: "holidays", keyName: "fieldKey" });

  useEffect(() => {
    if (active) reset(active);
  }, [active, reset]);

  const displayOptions = useMemo(
    () =>
      DisplayCalendarSchema.options.map((value) => ({
        value,
        label: t(DISPLAY_CALENDAR_KEY[value]),
      })),
    [t],
  );
  const periodKindOptions = useMemo(
    () =>
      AcademicPeriodKindSchema.options.map((value) => ({
        value,
        label: t(PERIOD_KIND_KEY[value]),
      })),
    [t],
  );

  if (calendars.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }
  if (calendars.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m01.calendar.error")}
        action={
          <Button variant="secondary" onClick={() => void calendars.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!active) {
    return (
      <EmptyState icon={<CalendarDays className="h-6 w-6" />} title={t("m01.calendar.empty")} />
    );
  }

  const displayPreview = previewDisplayDate(watch("startsOn"), watch("displayCalendar"), locale);
  const onSubmit = handleSubmit(async (data) => {
    try {
      await saveCalendar.mutateAsync({
        calendarId: active.id,
        data: {
          academicYear: data.academicYear,
          startsOn: data.startsOn,
          endsOn: data.endsOn,
          periods: data.periods,
          holidays: data.holidays,
          displayCalendar: data.displayCalendar,
        },
      });
      toast.show({ tone: "success", title: t("m01.calendar.saved") });
    } catch (error) {
      if (!applyServerErrors(error, setError)) {
        toast.show({ tone: "danger", title: t("m01.setup.saveFailed") });
      }
    }
  });

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-6">
      <Card title={t("m01.calendar.heading")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Input
            label={t("m01.calendar.academicYear")}
            required
            error={errors.academicYear?.message}
            {...register("academicYear")}
          />
          <Input
            type="date"
            label={t("m01.calendar.startsOn")}
            required
            error={errors.startsOn?.message}
            {...register("startsOn")}
          />
          <Input
            type="date"
            label={t("m01.calendar.endsOn")}
            required
            error={errors.endsOn?.message}
            {...register("endsOn")}
          />
          <Select
            label={t("m01.calendar.displayCalendar")}
            options={displayOptions}
            description={
              displayPreview
                ? t("m01.calendar.displayPreview", { date: displayPreview })
                : undefined
            }
            error={errors.displayCalendar?.message}
            {...register("displayCalendar")}
          />
        </div>
      </Card>

      <Card
        title={t("m01.calendar.periodsHeading")}
        actions={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!online}
            onClick={() =>
              periods.append({
                id: `per-${Date.now()}-${periods.fields.length + 1}`,
                kind: "term",
                name: "",
                startsOn: watch("startsOn") || active.startsOn,
                endsOn: watch("endsOn") || active.endsOn,
              })
            }
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("m01.calendar.addPeriod")}
          </Button>
        }
      >
        {periods.fields.length === 0 ? (
          <p className="text-body-sm text-text-muted">{t("m01.calendar.noPeriods")}</p>
        ) : (
          <div className="space-y-4">
            {periods.fields.map((field, index) => {
              const rowErr = errors.periods?.[index];
              const rowMessage = rowErr?.message ?? rowErr?.root?.message;
              return (
                <div
                  key={field.fieldKey}
                  className="space-y-2 rounded-md border border-border-default bg-bg-raised p-4"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_10rem_10rem_10rem_auto] lg:items-end">
                    <Input
                      label={t("m01.calendar.periodName")}
                      required
                      error={rowErr?.name?.message}
                      {...register(`periods.${index}.name`)}
                    />
                    <Select
                      label={t("m01.calendar.periodKind")}
                      options={periodKindOptions}
                      error={rowErr?.kind?.message}
                      {...register(`periods.${index}.kind`)}
                    />
                    <Input
                      type="date"
                      label={t("m01.calendar.periodStartsOn")}
                      required
                      error={rowErr?.startsOn?.message}
                      {...register(`periods.${index}.startsOn`)}
                    />
                    <Input
                      type="date"
                      label={t("m01.calendar.periodEndsOn")}
                      required
                      error={rowErr?.endsOn?.message}
                      {...register(`periods.${index}.endsOn`)}
                    />
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!online}
                      icon={<Trash2 className="h-4 w-4 text-danger-text" />}
                      aria-label={t("m01.calendar.removePeriod", {
                        name: watch(`periods.${index}.name`) || String(index + 1),
                      })}
                      onClick={() => periods.remove(index)}
                    />
                  </div>
                  {rowMessage && (
                    <p className="text-body-sm text-danger-text" role="alert">
                      {rowMessage}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <CalendarHolidaysCard
        fields={holidays.fields}
        append={holidays.append}
        remove={holidays.remove}
        register={register}
        watch={watch}
        errors={errors}
        defaultDate={watch("startsOn") || active.startsOn}
        online={online}
      />

      <div className="flex justify-end">
        <Button type="submit" loading={saveCalendar.isPending} disabled={!online}>
          {t("common.save")}
        </Button>
      </div>
    </form>
  );
}
