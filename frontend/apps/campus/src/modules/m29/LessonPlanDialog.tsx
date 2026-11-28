import { zodResolver } from "@hookform/resolvers/zod";
import {
  LessonPlanInputSchema,
  type ClassGroup,
  type LessonPlan,
  type LessonPlanInput,
  type SubjectOffering,
} from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import {
  useCreateLessonPlan,
  useOutcomes,
  useSyllabusUnits,
  useUpdateLessonPlan,
} from "@nexus/services";
import { Button, Checkbox, Input, Modal, Select, Textarea, useToast } from "@nexus/ui-core";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useOnline } from "../../app/RouteGuard";
import { LessonPlanActivities } from "./LessonPlanActivities";
import {
  applyLessonPlanApiError,
  lessonPlanDefaults,
  nullableDate,
  renumberActivities,
  resolveFormError,
} from "./lessonPlanForm";

export interface LessonPlanDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly plan: LessonPlan | null;
  readonly defaultOfferingId: string;
  readonly ownStaffProfileId: string;
  readonly offerings: readonly SubjectOffering[];
  readonly offeringLabels: ReadonlyMap<string, string>;
  readonly classGroups: readonly ClassGroup[];
}

/** Modal form for creating or editing a draft/returned lesson plan via the offline L2 outbox. */
export function LessonPlanDialog({
  open,
  onOpenChange,
  plan,
  defaultOfferingId,
  ownStaffProfileId,
  offerings,
  offeringLabels,
  classGroups,
}: LessonPlanDialogProps) {
  const t = useText();
  const toast = useToast();
  const online = useOnline();
  const createPlan = useCreateLessonPlan();
  const updatePlan = useUpdateLessonPlan();
  const outcomes = useOutcomes();

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    getValues,
    setValue,
    setError,
    formState: { errors },
  } = useForm<LessonPlanInput>({
    resolver: zodResolver(LessonPlanInputSchema),
    defaultValues: lessonPlanDefaults(plan, defaultOfferingId, ownStaffProfileId),
  });

  useEffect(() => {
    if (open) reset(lessonPlanDefaults(plan, defaultOfferingId, ownStaffProfileId));
  }, [open, plan, defaultOfferingId, ownStaffProfileId, reset]);

  const selectedOfferingId = watch("subjectOfferingId");
  const selectedTopics = watch("topicIds");
  const selectedOutcomes = watch("outcomeIds");
  const watchedTitle = watch("title");
  const offering = offerings.find((row) => row.id === selectedOfferingId) ?? null;
  const group = classGroups.find((row) => row.id === offering?.classGroupId);
  const syllabus = useSyllabusUnits(offering?.subjectId ?? null, open && offering !== null);

  const topicChoices = useMemo(() => {
    const raw = syllabus.data?.items ?? [];
    const matched = group?.yearLevelId
      ? raw.filter((u) => u.yearLevelId === null || u.yearLevelId === group.yearLevelId)
      : raw;
    return [...matched]
      .sort((a, b) => a.order - b.order)
      .flatMap((u) =>
        [...u.topics]
          .sort((a, b) => a.order - b.order)
          .map((tp) => ({ id: tp.id, label: `${u.title}: ${tp.title}` })),
      );
  }, [syllabus.data?.items, group?.yearLevelId]);

  const outcomeChoices = useMemo(
    () =>
      (outcomes.data?.items ?? []).map((o) => ({ id: o.id, label: `${o.code} — ${o.statement}` })),
    [outcomes.data?.items],
  );
  const offeringOptions = useMemo(
    () => offerings.map((r) => ({ value: r.id, label: offeringLabels.get(r.id) ?? r.id })),
    [offerings, offeringLabels],
  );

  const toggleId = (field: "topicIds" | "outcomeIds", id: string, checked: boolean) => {
    const cur = getValues(field);
    const next = checked ? (cur.includes(id) ? cur : [...cur, id]) : cur.filter((x) => x !== id);
    setValue(field, next, { shouldValidate: true, shouldDirty: true });
  };

  const onSubmit = handleSubmit(async (data) => {
    const payload: LessonPlanInput = {
      ...data,
      staffProfileId: ownStaffProfileId,
      source: "manual",
      activities: renumberActivities(data.activities),
    };
    try {
      const result = plan
        ? await updatePlan.mutateAsync({ id: plan.id, input: payload })
        : await createPlan.mutateAsync(payload);
      toast.show(
        result.queued
          ? { tone: "info", title: t("m29.planDialog.queued") }
          : {
              tone: "success",
              title: t(plan ? "m29.planDialog.updated" : "m29.planDialog.created"),
            },
      );
      onOpenChange(false);
    } catch (error) {
      applyLessonPlanApiError(error, setError, () =>
        toast.show({ tone: "danger", title: t("m29.planDialog.saveFailed") }),
      );
    }
  });

  const checklist = (
    field: "topicIds" | "outcomeIds",
    legend: string,
    empty: string,
    choices: readonly { id: string; label: string }[],
    selected: readonly string[],
    err: string | undefined,
  ) => (
    <fieldset className="space-y-2 rounded-md border border-border-default p-3">
      <legend className="px-1 font-sans text-label font-semibold text-text-primary">
        {legend}
      </legend>
      {choices.length === 0 ? (
        <p className="text-body-sm text-text-muted">{empty}</p>
      ) : (
        <div className="space-y-2">
          {choices.map((item) => (
            <Checkbox
              key={item.id}
              label={item.label}
              checked={selected.includes(item.id)}
              onCheckedChange={(checked) => toggleId(field, item.id, checked === true)}
            />
          ))}
        </div>
      )}
      {err && (
        <p role="alert" className="text-body-sm text-danger-text">
          {err}
        </p>
      )}
    </fieldset>
  );

  const rootErr = resolveFormError(errors.root, "m29.planDialog.invalidRequest", t);
  const titleErr = resolveFormError(
    errors.title,
    watchedTitle.trim() === "" ? "common.required" : "m29.planDialog.titleInvalid",
    t,
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t(plan ? "m29.planDialog.editTitle" : "m29.planDialog.createTitle")}
      description={t("m29.planDialog.description")}
      footer={
        <>
          {!online && (
            <p role="status" className="me-auto text-body-sm text-text-secondary">
              {t("m29.planDialog.offlineHint")}
            </p>
          )}
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="m29-lesson-plan-form"
            loading={createPlan.isPending || updatePlan.isPending}
          >
            {t(plan ? "m29.planDialog.submitEdit" : "m29.planDialog.submitCreate")}
          </Button>
        </>
      }
    >
      <form
        id="m29-lesson-plan-form"
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
            label={t("m29.planDialog.offering")}
            required
            placeholder={t("common.selectOption")}
            options={offeringOptions}
            error={resolveFormError(errors.subjectOfferingId, "common.required", t)}
            {...register("subjectOfferingId", {
              onChange: () => {
                setValue("topicIds", [], { shouldValidate: false });
                setValue("timetableSlotId", null);
              },
            })}
          />
          <Input
            type="date"
            label={t("m29.planDialog.date")}
            error={resolveFormError(errors.date, "m29.planDialog.dateInvalid", t)}
            {...register("date", { setValueAs: nullableDate })}
          />
        </div>
        <Input label={t("m29.planDialog.title")} required error={titleErr} {...register("title")} />
        {checklist(
          "topicIds",
          t("m29.planDialog.topics"),
          t("m29.planDialog.topicsEmpty"),
          topicChoices,
          selectedTopics,
          resolveFormError(errors.topicIds, "m29.planDialog.topicsRequired", t),
        )}
        {checklist(
          "outcomeIds",
          t("m29.planDialog.outcomes"),
          t("m29.planDialog.outcomesEmpty"),
          outcomeChoices,
          selectedOutcomes,
          resolveFormError(errors.outcomeIds, "m29.planDialog.invalidOutcomes", t),
        )}
        <Textarea label={t("m29.planDialog.objectives")} rows={2} {...register("objectives")} />
        <LessonPlanActivities
          control={control}
          register={register}
          getValues={getValues}
          errors={errors.activities}
        />
        <Textarea label={t("m29.planDialog.resources")} rows={2} {...register("resources")} />
      </form>
    </Modal>
  );
}
