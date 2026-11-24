import { zodResolver } from "@hookform/resolvers/zod";
import {
  TimetableSlotInputSchema,
  type ApiErrorDetail,
  type ClassGroup,
  type Room,
  type Subject,
  type SubjectOffering,
  type TimetableSlotInput,
} from "@nexus/contracts";
import { isKnownMessageKey, useText, type MessageKey } from "@nexus/i18n";
import { ApiRequestError, useCalendars, useCreateTimetableSlot, useTenant } from "@nexus/services";
import { Button, Checkbox, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useEffect, type ChangeEvent } from "react";
import { useForm, type UseFormSetError } from "react-hook-form";
import { useRuntime } from "../../app/TenantRuntime";
import { useStaffOptions } from "./LoadTab";
import { buildWeekdayOptions } from "./WeekTab";

type SlotField = keyof TimetableSlotInput;
type FieldMap = Partial<Readonly<Record<SlotField, MessageKey>>>;

const CONFLICT_KEYS: FieldMap = {
  roomId: "m16.addDialog.roomClash",
  staffProfileIds: "m16.addDialog.teacherClash",
  subjectOfferingId: "m16.addDialog.classClash",
};
const INVALID_KEYS: FieldMap = {
  subjectOfferingId: "m16.addDialog.invalidOffering",
  roomId: "m16.addDialog.invalidRoom",
  staffProfileIds: "m16.addDialog.invalidStaff",
  start: "m16.addDialog.timeInvalid",
  end: "m16.addDialog.timeInvalid",
  effectiveFrom: "m16.addDialog.dateInvalid",
};
const EMPTY_DEFAULTS: TimetableSlotInput = {
  academicYearId: "",
  periodId: null,
  subjectOfferingId: "",
  weekday: 1,
  start: "09:00",
  end: "09:50",
  roomId: null,
  staffProfileIds: [],
  effectiveFrom: "",
  effectiveTo: null,
};

const nullableId = (v: unknown): string | null =>
  typeof v === "string" && v.trim() !== "" ? v : null;
const reqOr = (v: string, key: MessageKey): MessageKey =>
  v.trim() === "" ? "common.required" : key;

function applyDetails(
  details: readonly ApiErrorDetail[] | undefined,
  map: FieldMap,
  fallback: MessageKey,
  setError: UseFormSetError<TimetableSlotInput>,
): void {
  let matched = false;
  for (const { path } of details ?? []) {
    const key = Object.hasOwn(map, path) ? map[path as SlotField] : undefined;
    if (!key) continue;
    setError(path as SlotField, { type: "server", message: key });
    matched = true;
  }
  if (!matched) setError("root", { type: "server", message: fallback });
}

export interface AddSlotDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly online: boolean;
  readonly selectedClassGroupId: string | null;
  readonly offerings: readonly SubjectOffering[];
  readonly subjectsById: ReadonlyMap<string, Subject>;
  readonly classGroupsById: ReadonlyMap<string, ClassGroup>;
  readonly rooms: readonly Room[];
}

/** Modal form for scheduling a new timetable slot (M16, L1: online save, Zod validated). */
export function AddSlotDialog(props: AddSlotDialogProps) {
  const { open, onOpenChange, online, selectedClassGroupId, offerings, rooms } = props;
  const t = useText();
  const toast = useToast();
  const { locale } = useRuntime();
  const tenant = useTenant();
  const calendars = useCalendars(tenant.data?.institutions[0]?.id ?? null);
  const staffOptions = useStaffOptions(offerings);
  const createSlot = useCreateTimetableSlot();
  const form = useForm<TimetableSlotInput>({
    resolver: zodResolver(TimetableSlotInputSchema),
    defaultValues: EMPTY_DEFAULTS,
  });
  const { register, handleSubmit, reset, watch, getValues, setValue, setError } = form;
  const { errors } = form.formState;

  const cals = calendars.data?.items ?? [];
  const defaultOffering =
    offerings.find((o) => o.classGroupId === selectedClassGroupId) ?? offerings[0];
  const defaultDate =
    (cals.find((c) => c.id === defaultOffering?.academicYearId) ?? cals[0])?.startsOn ?? "";

  useEffect(() => {
    if (open) reset(EMPTY_DEFAULTS);
  }, [open, reset]);
  useEffect(() => {
    if (!open) return;
    if (defaultOffering && !getValues("subjectOfferingId")) {
      setValue("subjectOfferingId", defaultOffering.id);
      setValue("academicYearId", defaultOffering.academicYearId);
      setValue("periodId", defaultOffering.periodId);
    }
    if (defaultDate && !getValues("effectiveFrom")) setValue("effectiveFrom", defaultDate);
  }, [open, defaultOffering, defaultDate, getValues, setValue]);

  const offeringOptions = offerings.map((o) => {
    const subject = props.subjectsById.get(o.subjectId)?.name ?? o.subjectId;
    const group = props.classGroupsById.get(o.classGroupId);
    return { value: o.id, label: group ? `${subject} — ${group.name} (${group.code})` : subject };
  });
  const roomOptions = [
    { value: "", label: t("m16.week.noRoom") },
    ...rooms.map((r) => ({ value: r.id, label: `${r.code} — ${r.name}` })),
  ];
  const values = watch();
  const toggleStaff = (staffId: string, checked: boolean) => {
    const next = checked
      ? [...new Set([...values.staffProfileIds, staffId])]
      : values.staffProfileIds.filter((id) => id !== staffId);
    setValue("staffProfileIds", next, { shouldValidate: true });
  };
  const onSubmit = handleSubmit(async (data) => {
    const chosen = offerings.find((o) => o.id === data.subjectOfferingId);
    const payload = chosen
      ? { ...data, academicYearId: chosen.academicYearId, periodId: chosen.periodId }
      : data;
    try {
      await createSlot.mutateAsync(payload);
      toast.show({ tone: "success", title: t("m16.addDialog.created") });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.error.code === "conflict") {
        applyDetails(error.error.details, CONFLICT_KEYS, "m16.addDialog.conflict", setError);
      } else if (error instanceof ApiRequestError && error.error.code === "invalid_request") {
        applyDetails(error.error.details, INVALID_KEYS, "m16.addDialog.invalidRequest", setError);
      } else {
        setError("root", { type: "server", message: "m16.addDialog.saveFailed" });
        toast.show({ tone: "danger", title: t("m16.addDialog.saveFailed") });
      }
    }
  });

  const endKey: MessageKey =
    values.end.trim() === ""
      ? "common.required"
      : values.start && values.end <= values.start
        ? "m16.addDialog.endBeforeStart"
        : "m16.addDialog.timeInvalid";
  const err = (e: { readonly message?: unknown } | undefined, fallback: MessageKey) => {
    if (!e) return undefined;
    return typeof e.message === "string" && isKnownMessageKey(e.message)
      ? t(e.message)
      : t(fallback);
  };
  const dateKey = reqOr(values.effectiveFrom, "m16.addDialog.dateInvalid");
  const startErr = err(errors.start, reqOr(values.start, "m16.addDialog.timeInvalid"));
  const dateErr = err(errors.effectiveFrom, dateKey);
  const staffErr = err(errors.staffProfileIds, "m16.addDialog.invalidStaff");
  const rootErr = err(errors.root, "m16.addDialog.invalidRequest");
  const onOfferingChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const chosen = offerings.find((o) => o.id === event.target.value);
    if (!chosen) return;
    setValue("academicYearId", chosen.academicYearId);
    setValue("periodId", chosen.periodId);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("m16.addDialog.title")}
      description={t("m16.addDialog.description")}
      footer={
        <>
          {!online && (
            <p role="status" className="me-auto text-body-sm text-text-secondary">
              {t("common.offline")}
            </p>
          )}
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="m16-add-slot-form"
            loading={createSlot.isPending}
            disabled={!online}
          >
            {t("m16.addDialog.submit")}
          </Button>
        </>
      }
    >
      <form
        id="m16-add-slot-form"
        onSubmit={(e) => void onSubmit(e)}
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
          label={t("m16.addDialog.offering")}
          required
          placeholder={t("common.selectOption")}
          options={offeringOptions}
          error={err(errors.subjectOfferingId, "common.required")}
          {...register("subjectOfferingId", { onChange: onOfferingChange })}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Select
            label={t("m16.addDialog.weekday")}
            required
            options={buildWeekdayOptions(locale)}
            error={err(errors.weekday, "common.required")}
            {...register("weekday", { setValueAs: Number })}
          />
          <Input
            type="time"
            label={t("m16.addDialog.start")}
            required
            error={startErr}
            {...register("start")}
          />
          <Input
            type="time"
            label={t("m16.addDialog.end")}
            required
            error={err(errors.end, endKey)}
            {...register("end")}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("m16.addDialog.room")}
            options={roomOptions}
            error={err(errors.roomId, "m16.addDialog.invalidRoom")}
            {...register("roomId", { setValueAs: nullableId })}
          />
          <Input
            type="date"
            label={t("m16.addDialog.effectiveFrom")}
            required
            error={dateErr}
            {...register("effectiveFrom")}
          />
        </div>
        <fieldset
          className="space-y-2"
          aria-describedby={staffErr ? "m16-teachers-error" : undefined}
        >
          <legend className="text-label font-sans font-semibold text-text-primary rtl:tracking-normal">
            {t("m16.addDialog.teachers")}
          </legend>
          {staffOptions.length === 0 ? (
            <p className="text-body-sm text-text-muted">{t("m16.addDialog.teachersEmpty")}</p>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {staffOptions.map((option) => (
                <Checkbox
                  key={option.id}
                  label={option.label}
                  checked={values.staffProfileIds.includes(option.id)}
                  onCheckedChange={(checked) => toggleStaff(option.id, checked === true)}
                />
              ))}
            </div>
          )}
          {staffErr && (
            <p id="m16-teachers-error" role="alert" className="text-body-sm text-danger-text">
              {staffErr}
            </p>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
