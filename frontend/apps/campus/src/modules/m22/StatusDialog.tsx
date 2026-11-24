import type { ReportCard, ReportCardStatusInput } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { ApiRequestError, useUpdateReportCardStatus } from "@nexus/services";
import { Button, Modal, useToast } from "@nexus/ui-core";
import { useState } from "react";
import { useOnline } from "../../app/RouteGuard";

type Target = ReportCardStatusInput["status"];
const actions: Record<Target, MessageKey> = {
  approved: "m22.action.approve",
  published: "m22.action.publish",
  withdrawn: "m22.action.withdraw",
};
const confirmations: Record<Target, MessageKey> = {
  approved: "m22.confirm.approve",
  published: "m22.confirm.publish",
  withdrawn: "m22.confirm.withdraw",
};
const nextStatus = { draft: "approved", approved: "published", published: "withdrawn" } as const;

export function StatusDialog({ card }: { readonly card: ReportCard }) {
  const t = useText();
  const toast = useToast();
  const online = useOnline();
  const update = useUpdateReportCardStatus();
  const [target, setTarget] = useState<Target | null>(null);
  const next = card.status === "withdrawn" ? null : nextStatus[card.status];

  const errorStatus = update.error instanceof ApiRequestError ? update.error.status : null;

  function submit() {
    if (!target || target !== next || !online || update.isPending) return;
    update.mutate(
      { id: card.id, status: target },
      {
        onSuccess: () => {
          setTarget(null);
          toast.show({ tone: "success", title: t("m22.action.saved") });
        },
      },
    );
  }

  return (
    <>
      {next && (
        <Button
          className="min-h-11"
          disabled={!online}
          onClick={() => {
            update.reset();
            setTarget(next);
          }}
        >
          {t(actions[next])}
        </Button>
      )}
      {next && !online && <p role="status">{t("common.offline")}</p>}
      {target && (
        <Modal
          open
          title={t(actions[target])}
          onOpenChange={(open) => {
            if (!open && !update.isPending) setTarget(null);
          }}
          footer={
            <>
              <Button
                className="min-h-11"
                variant="secondary"
                disabled={update.isPending}
                onClick={() => setTarget(null)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="min-h-11"
                disabled={!online || target !== next}
                loading={update.isPending}
                onClick={submit}
              >
                {t(actions[target])}
              </Button>
            </>
          }
        >
          <p>{t(confirmations[target])}</p>
          {update.isError && (
            <p role="alert">
              {t(
                errorStatus === 403
                  ? "common.shell.forbiddenTitle"
                  : errorStatus === 409
                    ? "m22.action.conflict"
                    : "m22.action.failed",
              )}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
