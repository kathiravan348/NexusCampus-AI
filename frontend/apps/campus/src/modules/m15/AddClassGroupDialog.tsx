import { zodResolver } from "@hookform/resolvers/zod";
import {
  ClassGroupInputSchema,
  type ClassGroupInput,
  type ClassGroupKind,
  type Program,
  type YearLevel,
} from "@nexus/contracts";
import { isKnownMessageKey, useText, type MessageKey, type Translate } from "@nexus/i18n";
import { ApiRequestError, useCalendars, useCreateClassGroup, useTenant } from "@nexus/services";
import { Button, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

const KINDS: readonly ClassGroupKind[] = ["section", "batch", "cohort", "group"];

const KIND_KEY: Readonly<Record<ClassGroupKind, MessageKey>> = {
  section: "m15.classGroupKind.section",
  batch: "m15.classGroupKind.batch",
  cohort: "m15.classGroupKind.cohort",
  group: "m15.classGroupKind.group",
};

const SERVER_FIELD_KEYS: Readonly<Record<string, readonly [keyof ClassGroupInput, MessageKey]>> = {
  programId: ["programId", "m15.addDialog.invalidProgram"],
  yearLevelId: ["yearLevelId", "m15.addDialog.invalidYearLevel"],
  academicYearId: ["academicYearId", "m15.addDialog.invalidAcademicYear"],
  campusId: ["campusId", "m15.addDialog.invalidCampus"],
  code: ["code", "m15.addDialog.codeInvalid"],
  name: ["name", "common.required"],
  capacity: ["capacity", "m15.addDialog.capacityInvalid"],
};

const EMPTY_DEFAULTS: ClassGroupInput = {
  campusId: null,
  academicYearId: "",
  programId: "",
  yearLevelId: null,
  kind: "section",
  code: "",
  name: "",
  capacity: null,
  homeroomStaffProfileId: null,
};

const nullableId = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value : null;

function parseCapacity(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  const trimmed = String(value).trim();
  return trimmed === "" ? null : Number(trimmed);
}

function resolveError(
  error: { readonly message?: string } | undefined,
  fallbackKey: MessageKey,
  t: Translate,
): string | undefined {
  if (!error) return undefined;
  if (error.message && isKnownMessageKey(error.message)) return t(error.message);
  return t(fallbackKey);
}

export interface AddClassGroupDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly online: boolean;
  readonly programs: readonly Program[];
  readonly yearLevels: readonly YearLevel[];
}

/** Modal form for creating a class group (M15, L1: online save, validated with Zod). */
export function AddClassGroupDialog({
  open,
  onOpenChange,
  online,
  programs,
  yearLevels,
}: AddClassGroupDialogProps) {
  const t = useText();
  const toast = useToast();
  const tenant = useTenant();
  const institutionId = tenant.data?.institutions[0]?.id ?? null;
  const calendars = useCalendars(institutionId);
  const createClassGroup = useCreateClassGroup();

  const {
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ClassGroupInput>({
    resolver: zodResolver(ClassGroupInputSchema),
    defaultValues: EMPTY_DEFAULTS,
  });

  const calendarList = calendars.data?.items ?? [];
  const campusList = tenant.data?.campuses ?? [];
  const firstProgramId = programs[0]?.id ?? "";
  const firstCalendarId = calendarList[0]?.id ?? "";

  useEffect(() => {
    if (open) reset(EMPTY_DEFAULTS);
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    if (firstProgramId && !getValues("programId")) setValue("programId", firstProgramId);
    if (firstCalendarId && !getValues("academicYearId")) {
      setValue("academicYearId", firstCalendarId);
    }
  }, [open, firstProgramId, firstCalendarId, getValues, setValue]);

  const selectedProgramId = watch("programId");
  const watchedCode = watch("code");
  const watchedName = watch("name");

  const programOptions = programs.map((p) => ({ value: p.id, label: p.name }));
  const yearOptions = calendarList.map((c) => ({ value: c.id, label: c.academicYear }));
  const matchingLevels = yearLevels
    .filter((yl) => yl.programId === selectedProgramId)
    .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
  const yearLevelOptions = [
    { value: "", label: t("m15.programs.noYearLevel") },
    ...matchingLevels.map((yl) => ({ value: yl.id, label: `${yl.name} (${yl.code})` })),
  ];
  const campusOptions = [
    { value: "", label: t("m15.addDialog.campusNone") },
    ...campusList.map((c) => ({ value: c.id, label: c.name })),
  ];
  const kindOptions = KINDS.map((kind) => ({ value: kind, label: t(KIND_KEY[kind]) }));

  const onSubmit = handleSubmit(async (data) => {
    try {
      await createClassGroup.mutateAsync(data);
      toast.show({ tone: "success", title: t("m15.addDialog.created") });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiRequestError && error.error.code === "conflict") {
        setError("code", { type: "server", message: "m15.addDialog.duplicateCode" });
      } else if (error instanceof ApiRequestError && error.error.code === "invalid_request") {
        let matched = false;
        for (const detail of error.error.details ?? []) {
          const mapped = SERVER_FIELD_KEYS[detail.path];
          if (mapped) {
            const [field, key] = mapped;
            setError(field, { type: "server", message: key });
            matched = true;
          }
        }
        if (!matched) {
          setError("root", { type: "server", message: "m15.addDialog.invalidRequest" });
        }
      } else {
        setError("root", { type: "server", message: "m15.addDialog.saveFailed" });
        toast.show({ tone: "danger", title: t("m15.addDialog.saveFailed") });
      }
    }
  });

  const codeErr = resolveError(
    errors.code,
    watchedCode.trim() === "" ? "common.required" : "m15.addDialog.codeInvalid",
    t,
  );
  const nameErr = resolveError(
    errors.name,
    watchedName.trim() === "" ? "common.required" : "m15.addDialog.nameInvalid",
    t,
  );
  const rootErr = resolveError(errors.root, "m15.addDialog.invalidRequest", t);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("m15.addDialog.title")}
      description={t("m15.addDialog.description")}
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
            form="m15-add-class-group-form"
            loading={createClassGroup.isPending}
            disabled={!online}
          >
            {t("m15.addDialog.submit")}
          </Button>
        </>
      }
    >
      <form
        id="m15-add-class-group-form"
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

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("m15.addDialog.program")}
            required
            placeholder={t("common.selectOption")}
            options={programOptions}
            error={resolveError(errors.programId, "common.required", t)}
            {...register("programId", { onChange: () => setValue("yearLevelId", null) })}
          />
          <Select
            label={t("m15.addDialog.academicYear")}
            required
            placeholder={t("common.selectOption")}
            options={yearOptions}
            error={resolveError(errors.academicYearId, "common.required", t)}
            {...register("academicYearId")}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("m15.addDialog.yearLevel")}
            options={yearLevelOptions}
            error={resolveError(errors.yearLevelId, "m15.addDialog.invalidYearLevel", t)}
            {...register("yearLevelId", { setValueAs: nullableId })}
          />
          <Select
            label={t("m15.addDialog.kind")}
            required
            options={kindOptions}
            error={resolveError(errors.kind, "common.required", t)}
            {...register("kind")}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={t("m15.addDialog.code")}
            description={t("m15.addDialog.codeHint")}
            required
            error={codeErr}
            {...register("code")}
          />
          <Input label={t("m15.addDialog.name")} required error={nameErr} {...register("name")} />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("m15.addDialog.campus")}
            options={campusOptions}
            error={resolveError(errors.campusId, "m15.addDialog.invalidCampus", t)}
            {...register("campusId", { setValueAs: nullableId })}
          />
          <Input
            type="number"
            numeric
            min={1}
            max={2000}
            step={1}
            label={t("m15.addDialog.capacity")}
            description={t("m15.addDialog.capacityHint")}
            error={resolveError(errors.capacity, "m15.addDialog.capacityInvalid", t)}
            {...register("capacity", { setValueAs: parseCapacity })}
          />
        </div>
      </form>
    </Modal>
  );
}
