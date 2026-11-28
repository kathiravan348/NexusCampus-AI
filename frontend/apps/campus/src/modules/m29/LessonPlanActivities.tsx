import type { LessonPlanInput } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { Button, IconButton, Input, Select } from "@nexus/ui-core";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useMemo } from "react";
import {
  useFieldArray,
  type Control,
  type FieldErrors,
  type UseFormGetValues,
  type UseFormRegister,
} from "react-hook-form";
import {
  ACTIVITY_KINDS,
  ACTIVITY_KIND_KEY,
  parseMinutes,
  renumberActivities,
  resolveFormError,
} from "./lessonPlanForm";

export interface LessonPlanActivitiesProps {
  readonly control: Control<LessonPlanInput>;
  readonly register: UseFormRegister<LessonPlanInput>;
  readonly getValues: UseFormGetValues<LessonPlanInput>;
  readonly errors: FieldErrors<LessonPlanInput>["activities"];
}

/** Ordered lesson activities list with add, remove and move up/down controls. */
export function LessonPlanActivities({
  control,
  register,
  getValues,
  errors,
}: LessonPlanActivitiesProps) {
  const t = useText();
  const { fields, replace } = useFieldArray({ control, name: "activities" });

  const kindOptions = useMemo(
    () => ACTIVITY_KINDS.map((kind) => ({ value: kind, label: t(ACTIVITY_KIND_KEY[kind]) })),
    [t],
  );

  const addActivity = () =>
    replace(
      renumberActivities([
        ...getValues("activities"),
        { order: 1, title: "", minutes: 10, kind: "instruction" },
      ]),
    );

  const removeActivity = (index: number) =>
    replace(renumberActivities(getValues("activities").filter((_, idx) => idx !== index)));

  const moveActivity = (index: number, delta: -1 | 1) => {
    const next = [...getValues("activities")];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    replace(renumberActivities(next));
  };

  const listErr = resolveFormError(
    errors?.root ?? (errors?.message ? errors : undefined),
    "m29.planDialog.activitiesInvalid",
    t,
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-sans text-label font-semibold text-text-primary">
          {t("m29.planDialog.activities")}
        </span>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={fields.length >= 30}
          onClick={addActivity}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          {t("m29.planDialog.addActivity")}
        </Button>
      </div>

      {fields.length === 0 ? (
        <p className="text-body-sm text-text-muted">{t("m29.planDialog.activitiesEmpty")}</p>
      ) : (
        <ol className="space-y-2">
          {fields.map((field, index) => {
            const rowErr = errors?.[index];
            return (
              <li
                key={field.id}
                className="space-y-2 rounded-md border border-border-default bg-bg-raised p-3"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                  <Input
                    label={t("m29.planDialog.activityTitle")}
                    required
                    containerClassName="sm:col-span-2"
                    error={resolveFormError(rowErr?.title, "common.required", t)}
                    {...register(`activities.${index}.title`)}
                  />
                  <Input
                    type="number"
                    numeric
                    min={1}
                    max={600}
                    step={1}
                    required
                    label={t("m29.planDialog.activityMinutes")}
                    error={resolveFormError(rowErr?.minutes, "m29.planDialog.minutesInvalid", t)}
                    {...register(`activities.${index}.minutes`, { setValueAs: parseMinutes })}
                  />
                  <Select
                    label={t("m29.planDialog.activityKind")}
                    options={kindOptions}
                    {...register(`activities.${index}.kind`)}
                  />
                </div>
                <div className="flex justify-end gap-1">
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<ArrowUp className="h-4 w-4" />}
                    aria-label={t("m29.planDialog.moveUp", { index: index + 1 })}
                    disabled={index === 0}
                    onClick={() => moveActivity(index, -1)}
                  />
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<ArrowDown className="h-4 w-4" />}
                    aria-label={t("m29.planDialog.moveDown", { index: index + 1 })}
                    disabled={index === fields.length - 1}
                    onClick={() => moveActivity(index, 1)}
                  />
                  <IconButton
                    type="button"
                    variant="ghost"
                    size="sm"
                    icon={<Trash2 className="h-4 w-4" />}
                    aria-label={t("m29.planDialog.removeActivity", { index: index + 1 })}
                    onClick={() => removeActivity(index)}
                  />
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {listErr && (
        <p role="alert" className="text-body-sm text-danger-text">
          {listErr}
        </p>
      )}
    </div>
  );
}
