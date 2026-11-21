import { useControlText } from "@nexus/i18n/control";
import { useReplyToTicket } from "@nexus/services/control";
import { Button, Checkbox, Textarea, useToast } from "@nexus/ui-core";
import { useState } from "react";

/** Reply to the customer or add an internal note (`ctl.ticket.reply`). */
export function ReplyForm({ ticketId }: { readonly ticketId: string }) {
  const t = useControlText();
  const toast = useToast();
  const reply = useReplyToTicket();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const text = body.trim();

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!text) return;
        reply.mutate(
          { ticketId, body: text, internal },
          {
            onSuccess: () => {
              setBody("");
              setInternal(false);
              toast.show({ tone: "success", title: t("p09.reply.sent") });
            },
            onError: () => toast.show({ tone: "danger", title: t("p09.reply.failed") }),
          },
        );
      }}
    >
      <Textarea
        label={t("p09.reply.label")}
        description={t("p09.reply.hint")}
        value={body}
        rows={4}
        maxLength={5000}
        onChange={(e) => setBody(e.target.value)}
      />
      <Checkbox
        label={t("p09.reply.internal")}
        checked={internal}
        onCheckedChange={(value) => setInternal(value === true)}
      />
      <Button type="submit" disabled={!text || reply.isPending}>
        {t("p09.reply.send")}
      </Button>
    </form>
  );
}
