import type {
  ConfirmMoveStep,
  PortabilityDirection,
  PortabilityJob,
  PortabilityStepName,
} from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useConfirmMoveStep } from "@nexus/services/control";
import { Button, Checkbox, Input, Modal, Textarea, useToast } from "@nexus/ui-core";
import { useState } from "react";
import { MOVE_STEP_KEY } from "./labels";

export function isSourceCell(direction: PortabilityDirection): boolean {
  return direction === "region_move" || direction === "saas_to_self_hosted";
}

export function isDestinationCell(direction: PortabilityDirection): boolean {
  return direction === "region_move" || direction === "self_hosted_to_saas";
}

/** True when `step` is confirmed by staff for `direction` (rather than run by a cell agent). */
export function isStaffMoveStep(
  direction: PortabilityDirection,
  step: PortabilityStepName,
): boolean {
  switch (step) {
    case "preflight":
      return !isDestinationCell(direction);
    case "export_encrypted":
      return !isSourceCell(direction);
    case "transfer":
      return true;
    case "import":
      return !isDestinationCell(direction);
    case "verify":
      return false;
    case "cutover":
      return true;
    case "shred_source":
      return !isSourceCell(direction);
  }
}

function isPlainFileName(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 200 &&
    !value.includes("/") &&
    !value.includes("\\") &&
    value !== "." &&
    value !== ".."
  );
}

/** Modal that asks only for the fields needed by the current staff step of a move (NEX-142, D61). */
export function ConfirmStepModal({
  job,
  step,
  onClose,
}: {
  readonly job: PortabilityJob;
  readonly step: PortabilityStepName;
  readonly onClose: () => void;
}) {
  const t = useControlText();
  const toast = useToast();
  const confirm = useConfirmMoveStep(job.id);

  const [pem, setPem] = useState("");
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [chainOk, setChainOk] = useState(false);
  const [checkpointOk, setCheckpointOk] = useState(false);

  const parsedRows = Number(rows);
  const validRows = rows.trim() !== "" && Number.isInteger(parsedRows) && parsedRows >= 1;
  const trimmedPem = pem.trim();
  const trimmedFile = fileName.trim();

  let valid = false;
  let payload: ConfirmMoveStep = { step };
  if (step === "preflight") {
    valid = trimmedPem.length >= 64 && trimmedPem.length <= 1900;
    payload = { step, pem: trimmedPem };
  } else if (step === "export_encrypted") {
    valid = isPlainFileName(trimmedFile) && validRows;
    payload = { step, fileName: trimmedFile, rows: parsedRows };
  } else if (step === "transfer") {
    valid = acknowledged;
    payload = { step };
  } else if (step === "import") {
    valid = validRows && chainOk && checkpointOk;
    payload = { step, rows: parsedRows, chainOk, checkpointOk };
  } else if (step === "cutover") {
    valid = acknowledged;
    payload = { step };
  } else if (step === "shred_source") {
    valid = acknowledged;
    payload = { step };
  }

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("p18.confirm.title", { step: t(MOVE_STEP_KEY[step]) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={step === "cutover" || step === "shred_source" ? "danger" : "primary"}
            disabled={!valid || confirm.isPending}
            onClick={() =>
              confirm.mutate(payload, {
                onSuccess: () => {
                  toast.show({ tone: "success", title: t("p18.confirmed") });
                  onClose();
                },
                onError: () => toast.show({ tone: "danger", title: t("p18.confirmFailed") }),
              })
            }
          >
            {t("p18.confirm.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {step === "preflight" && (
          <Textarea
            label={t("p18.confirm.pem")}
            description={t("p18.confirm.pemHint")}
            rows={5}
            value={pem}
            onChange={(e) => setPem(e.target.value)}
          />
        )}
        {step === "export_encrypted" && (
          <>
            <Input
              label={t("p18.confirm.fileName")}
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
            />
            <Input
              label={t("p18.confirm.rows")}
              type="number"
              min={1}
              numeric
              value={rows}
              onChange={(e) => setRows(e.target.value)}
            />
          </>
        )}
        {step === "transfer" && (
          <Checkbox
            label={t("p18.confirm.transferReady")}
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
          />
        )}
        {step === "import" && (
          <>
            <Input
              label={t("p18.confirm.rows")}
              type="number"
              min={1}
              numeric
              value={rows}
              onChange={(e) => setRows(e.target.value)}
            />
            <Checkbox
              label={t("p18.confirm.chainOk")}
              checked={chainOk}
              onCheckedChange={(v) => setChainOk(v === true)}
            />
            <Checkbox
              label={t("p18.confirm.checkpointOk")}
              checked={checkpointOk}
              onCheckedChange={(v) => setCheckpointOk(v === true)}
            />
          </>
        )}
        {step === "cutover" && (
          <>
            <p className="rounded-md bg-warning-subtle p-3 text-body-sm text-warning-text">
              {t("p18.confirm.cutoverWarning")}
            </p>
            <Checkbox
              label={t("p18.confirm.cutoverAck")}
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
          </>
        )}
        {step === "shred_source" && (
          <Checkbox
            label={t("p18.confirm.sourceDeleted")}
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
          />
        )}
        {confirm.isError && (
          <p role="alert" className="text-body-sm text-danger-text">
            {t("p18.confirmFailed")}
          </p>
        )}
      </div>
    </Modal>
  );
}
