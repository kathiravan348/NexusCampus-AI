import { zodResolver } from "@hookform/resolvers/zod";
import { LessonPlanReviewInputSchema, type LessonPlanReviewInput } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { Button, Modal, Select, Textarea } from "@nexus/ui-core";
import { useForm } from "react-hook-form";

interface Props {
  readonly title: string;
  readonly decision: LessonPlanReviewInput["decision"];
  readonly onClose: () => void;
  readonly onSave: (input: LessonPlanReviewInput) => Promise<boolean>;
}

export function LessonPlanReviewDialog({ title, decision, onClose, onSave }: Props) {
  const t = useText();
  const {
    register,
    watch,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LessonPlanReviewInput>({
    resolver: zodResolver(LessonPlanReviewInputSchema),
    defaultValues: { decision, note: null },
  });
  const returning = watch("decision") === "return";
  const submit = handleSubmit(async (input) => {
    if (await onSave(input)) onClose();
  });
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
      title={t("m29.workflow.reviewTitle")}
      description={title}
    >
      <form noValidate onSubmit={(event) => void submit(event)} className="space-y-4">
        <Select
          label={t("m29.workflow.decision")}
          options={[
            { value: "approve", label: t("m29.workflow.approve") },
            { value: "return", label: t("m29.workflow.return") },
          ]}
          {...register("decision")}
        />
        <Textarea
          label={t("m29.plans.reviewerNote")}
          required={returning}
          rows={3}
          error={errors.note ? t("m29.workflow.noteError") : undefined}
          {...register("note", { setValueAs: (value: string | null) => value?.trim() || null })}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" loading={isSubmitting}>
            {t(returning ? "m29.workflow.return" : "m29.workflow.approve")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
