import type { Quote } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useSendQuote } from "@nexus/services/control";
import { Button, Checkbox, Modal, useToast } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useControlFormat } from "../../app/format";

export interface SendQuoteModalProps {
  readonly quote: Quote;
  readonly accountName: string;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** Confirms sending a draft quote. An AI draft needs a person to tick "I checked this AI draft" first (A-1). */
export function SendQuoteModal({ quote, accountName, open, onOpenChange }: SendQuoteModalProps) {
  const t = useControlText();
  const fmt = useControlFormat();
  const toast = useToast();
  const send = useSendQuote();
  const [checked, setChecked] = useState(false);
  const blocked = quote.aiDrafted && !checked;

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) setChecked(false);
        onOpenChange(next);
      }}
      title={t("p02.send.title", { number: quote.number })}
      description={t("p02.send.body", {
        account: accountName,
        total: fmt.money(quote.totalMinor, quote.currency),
        date: fmt.date(quote.validUntil),
      })}
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={blocked || send.isPending}
            onClick={() =>
              send.mutate(
                { id: quote.id, checkedByHuman: checked },
                {
                  onSuccess: () => {
                    toast.show({ tone: "success", title: t("p02.send.done") });
                    setChecked(false);
                    onOpenChange(false);
                  },
                  onError: () => toast.show({ tone: "danger", title: t("p02.send.failed") }),
                },
              )
            }
          >
            {t("p02.send.confirm")}
          </Button>
        </>
      }
    >
      {quote.aiDrafted && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-md bg-warning-subtle p-3 text-body-sm text-warning-text">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t("p02.send.aiWarning")}
          </p>
          <Checkbox
            label={t("p02.send.checked")}
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
          />
        </div>
      )}
    </Modal>
  );
}
