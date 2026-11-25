import {
  PromotionActionSchema,
  type PromotionAction,
  type PromotionDecision,
  type RolloverRun,
} from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { ApiRequestError, useChangeDecision, useClassGroups } from "@nexus/services";
import { Button, Modal, Select } from "@nexus/ui-core";
import { useEffect, useState } from "react";

interface Props {
  readonly run: RolloverRun;
  readonly decision: PromotionDecision | null;
  readonly onClose: () => void;
  readonly online: boolean;
}

const needsTarget = (action: PromotionAction) => action === "promote" || action === "detain";

/** Changes one learner's decision while the dry run is ready (M86, D84; online only). */
export function ChangeDecisionDialog({ run, decision, onClose, online }: Props) {
  const t = useText();
  const groups = useClassGroups();
  const change = useChangeDecision(run.id);
  const [action, setAction] = useState<PromotionAction>("promote");
  const [target, setTarget] = useState("");
  const [error, setError] = useState<"target" | "failed" | null>(null);

  useEffect(() => {
    if (!decision) return;
    setAction(decision.action);
    setTarget(decision.toClassGroupId ?? "");
    setError(null);
  }, [decision]);

  const targets = (groups.data?.items ?? []).filter(
    (row) => row.academicYearId === run.toAcademicYearId && row.institutionId === run.institutionId,
  );
  const submit = async () => {
    if (!decision) return;
    if (needsTarget(action) && !target) {
      setError("target");
      return;
    }
    try {
      await change.mutateAsync({
        decisionId: decision.id,
        input: { action, toClassGroupId: needsTarget(action) ? target : null, reasonKey: null },
      });
      onClose();
    } catch (failure) {
      const targetRejected =
        failure instanceof ApiRequestError &&
        failure.error.details?.some((detail) => detail.path === "toClassGroupId");
      setError(targetRejected ? "target" : "failed");
    }
  };

  return (
    <Modal
      open={decision !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t("m86.change.title")}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            loading={change.isPending}
            disabled={!online}
            onClick={() => void submit()}
          >
            {t("m86.change.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error === "failed" && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm font-medium text-danger-text"
          >
            {t("m86.actionFailed")}
          </p>
        )}
        <Select
          label={t("m86.decision.action")}
          required
          options={PromotionActionSchema.options.map((value) => ({
            value,
            label: t(`m86.action.${value}`),
          }))}
          value={action}
          onChange={(event) => {
            const next = PromotionActionSchema.safeParse(event.target.value);
            if (next.success) setAction(next.data);
          }}
        />
        {needsTarget(action) && (
          <Select
            label={t("m86.change.target")}
            required
            placeholder={t("common.selectOption")}
            options={targets.map((row) => ({ value: row.id, label: row.name }))}
            value={target}
            error={error === "target" ? t("m86.change.invalidTarget") : undefined}
            onChange={(event) => setTarget(event.target.value)}
          />
        )}
      </div>
    </Modal>
  );
}
