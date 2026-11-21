import type { Invoice } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useRecordTransfer } from "@nexus/services/control";
import { Button, Input, Modal, useToast } from "@nexus/ui-core";
import { useState } from "react";
import { useControlFormat } from "../../app/format";

export interface RecordTransferModalProps {
  readonly invoice: Invoice;
  readonly accountName: string;
  readonly onClose: () => void;
}

/** Records a bank transfer we received: our statement reference only, never the customer's bank details. */
export function RecordTransferModal({ invoice, accountName, onClose }: RecordTransferModalProps) {
  const t = useControlText();
  const fmt = useControlFormat();
  const toast = useToast();
  const record = useRecordTransfer();
  const [reference, setReference] = useState("");
  const valid = reference.trim().length >= 3;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("p03.record.title", { number: invoice.number })}
      description={t("p03.record.body", {
        total: fmt.money(invoice.totalMinor, invoice.currency),
        account: accountName,
      })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!valid || record.isPending}
            onClick={() =>
              record.mutate(
                { invoiceId: invoice.id, reference: reference.trim() },
                {
                  onSuccess: () => {
                    toast.show({ tone: "success", title: t("p03.record.done") });
                    onClose();
                  },
                  onError: () => toast.show({ tone: "danger", title: t("p03.record.failed") }),
                },
              )
            }
          >
            {t("p03.record.confirm")}
          </Button>
        </>
      }
    >
      <Input
        label={t("p03.record.reference")}
        description={t("p03.record.referenceHint")}
        value={reference}
        maxLength={64}
        autoComplete="off"
        onChange={(e) => setReference(e.target.value)}
      />
    </Modal>
  );
}
