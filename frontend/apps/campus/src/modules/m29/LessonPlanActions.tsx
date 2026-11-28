import type { LessonPlan, LessonPlanReviewInput } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { Button, Input } from "@nexus/ui-core";
import { Pencil } from "lucide-react";
import { useState } from "react";

interface Props {
  readonly plan: LessonPlan;
  readonly ownStaffProfileId: string | null;
  readonly canWrite: boolean;
  readonly canReview: boolean;
  readonly pending: boolean;
  readonly onEdit: () => void;
  readonly onSubmit: () => void;
  readonly onDeliver: (date: string) => void;
  readonly onReview: (decision: LessonPlanReviewInput["decision"]) => void;
}

export function LessonPlanActions({
  plan,
  ownStaffProfileId,
  canWrite,
  canReview,
  pending,
  onEdit,
  onSubmit,
  onDeliver,
  onReview,
}: Props) {
  const t = useText();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  if (!ownStaffProfileId) return null;
  if (ownStaffProfileId === plan.staffProfileId && canWrite) {
    if (plan.status === "approved") {
      return (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onDeliver(date);
          }}
        >
          <Input
            type="date"
            label={t("m29.workflow.deliveredOn")}
            required
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending || !date || date > today}>
            {t("m29.workflow.deliver")}
          </Button>
        </form>
      );
    }
    if (plan.status === "draft" || plan.status === "returned") {
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={onEdit}
            disabled={pending}
            aria-label={t("m29.plans.editLabel", { title: plan.title })}
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
            {t("common.edit")}
          </Button>
          <Button size="sm" onClick={onSubmit} disabled={pending}>
            {t("m29.workflow.submit")}
          </Button>
        </div>
      );
    }
  }
  if (canReview && ownStaffProfileId !== plan.staffProfileId && plan.status === "submitted") {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => onReview("approve")}>
          {t("m29.workflow.approve")}
        </Button>
        <Button size="sm" disabled={pending} variant="secondary" onClick={() => onReview("return")}>
          {t("m29.workflow.return")}
        </Button>
      </div>
    );
  }
  return null;
}
