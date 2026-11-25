import type { RolloverRun } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useConfirmRollover, useRollBackRollover } from "@nexus/services";
import { Button, Modal, useToast } from "@nexus/ui-core";
import { useState } from "react";

interface Props {
  readonly run: RolloverRun;
  readonly online: boolean;
}

type Step = "confirm" | "rollback" | null;

/** Confirm a ready dry run or roll back a completed run inside its window (M86, D84; online only). */
export function RunActions({ run, online }: Props) {
  const t = useText();
  const toast = useToast();
  const confirm = useConfirmRollover();
  const rollBack = useRollBackRollover();
  const [step, setStep] = useState<Step>(null);
  const [failed, setFailed] = useState(false);
  const canConfirm = run.status === "dry_run_ready";
  const canRollBack =
    run.status === "completed" &&
    run.rollbackUntil !== null &&
    Date.parse(run.rollbackUntil) > Date.now();
  if (!canConfirm && !canRollBack) return null;

  const open = (next: Step) => {
    setFailed(false);
    setStep(next);
  };
  const submit = async () => {
    try {
      if (step === "confirm") {
        await confirm.mutateAsync(run.id);
        toast.show({ tone: "success", title: t("m86.confirm.done") });
      } else {
        await rollBack.mutateAsync(run.id);
        toast.show({ tone: "success", title: t("m86.rollback.done") });
      }
      setStep(null);
    } catch {
      setFailed(true);
    }
  };
  const title = step === "rollback" ? t("m86.rollback.open") : t("m86.confirm.open");
  const description =
    step === "rollback"
      ? t("m86.rollback.description")
      : t("m86.confirm.description", { ...run.counts });

  return (
    <div className="flex flex-wrap gap-2">
      {canConfirm && (
        <Button className="min-h-11" disabled={!online} onClick={() => open("confirm")}>
          {t("m86.confirm.open")}
        </Button>
      )}
      {canRollBack && (
        <Button
          className="min-h-11"
          variant="secondary"
          disabled={!online}
          onClick={() => open("rollback")}
        >
          {t("m86.rollback.open")}
        </Button>
      )}
      <Modal
        open={step !== null}
        onOpenChange={(next) => !next && setStep(null)}
        title={title}
        description={description}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setStep(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              loading={confirm.isPending || rollBack.isPending}
              disabled={!online}
              onClick={() => void submit()}
            >
              {title}
            </Button>
          </>
        }
      >
        {failed && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm font-medium text-danger-text"
          >
            {t("m86.actionFailed")}
          </p>
        )}
      </Modal>
    </div>
  );
}
