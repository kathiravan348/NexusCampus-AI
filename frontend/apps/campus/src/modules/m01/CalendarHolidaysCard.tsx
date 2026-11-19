import type { AcademicCalendar } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { Button, Card, IconButton, Input } from "@nexus/ui-core";
import { Plus, Trash2 } from "lucide-react";
import type {
  FieldArrayWithId,
  FieldErrors,
  UseFieldArrayAppend,
  UseFieldArrayRemove,
  UseFormRegister,
  UseFormWatch,
} from "react-hook-form";

export interface CalendarHolidaysCardProps {
  readonly fields: readonly FieldArrayWithId<AcademicCalendar, "holidays", "fieldKey">[];
  readonly append: UseFieldArrayAppend<AcademicCalendar, "holidays">;
  readonly remove: UseFieldArrayRemove;
  readonly register: UseFormRegister<AcademicCalendar>;
  readonly watch: UseFormWatch<AcademicCalendar>;
  readonly errors: FieldErrors<AcademicCalendar>;
  readonly defaultDate: string;
  readonly online: boolean;
}

/** Holidays table card for the M01 academic calendar form. */
export function CalendarHolidaysCard({
  fields,
  append,
  remove,
  register,
  watch,
  errors,
  defaultDate,
  online,
}: CalendarHolidaysCardProps) {
  const t = useText();

  return (
    <Card
      title={t("m01.calendar.holidaysHeading")}
      actions={
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!online}
          onClick={() => append({ date: defaultDate, name: "" })}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          {t("m01.calendar.addHoliday")}
        </Button>
      }
    >
      {fields.length === 0 ? (
        <p className="text-body-sm text-text-muted">{t("m01.calendar.noHolidays")}</p>
      ) : (
        <div className="space-y-3">
          {fields.map((field, index) => {
            const rowErr = errors.holidays?.[index];
            return (
              <div
                key={field.fieldKey}
                className="grid grid-cols-1 gap-3 rounded-md border border-border-default bg-bg-raised p-4 sm:grid-cols-[12rem_1fr_auto] sm:items-end"
              >
                <Input
                  type="date"
                  label={t("m01.calendar.holidayDate")}
                  required
                  error={rowErr?.date?.message}
                  {...register(`holidays.${index}.date`)}
                />
                <Input
                  label={t("m01.calendar.holidayName")}
                  required
                  error={rowErr?.name?.message}
                  {...register(`holidays.${index}.name`)}
                />
                <IconButton
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!online}
                  icon={<Trash2 className="h-4 w-4 text-danger-text" />}
                  aria-label={t("m01.calendar.removeHoliday", {
                    name: watch(`holidays.${index}.name`) || String(index + 1),
                  })}
                  onClick={() => remove(index)}
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
