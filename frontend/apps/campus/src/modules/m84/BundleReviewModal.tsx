import type { DiagnosticBundle } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useApproveBundle,
  useDiagnosticContent,
  useDiscardBundle,
} from "@nexus/services";
import { Button, Modal, Skeleton, Textarea, useToast } from "@nexus/ui-core";
import { useState } from "react";

export interface BundleReviewModalProps {
  /** The bundle waiting for review; `null` keeps the dialog closed. */
  readonly bundle: DiagnosticBundle | null;
  readonly onClose: () => void;
}

/**
 * Shows exactly the text a support diagnostic bundle would send, then lets the admin approve sending or discard it
 * (V-6, NEX-144). Both choices are final, so Discard asks once more; nothing can be approved before the text loaded.
 */
export function BundleReviewModal({ bundle, onClose }: BundleReviewModalProps) {
  const t = useText();
  const toast = useToast();
  const content = useDiagnosticContent(bundle?.id ?? null);
  const approve = useApproveBundle();
  const discard = useDiscardBundle();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [failed, setFailed] = useState<"conflict" | "other" | null>(null);

  if (!bundle) return null;
  const busy = approve.isPending || discard.isPending;

  const close = () => {
    setConfirmDiscard(false);
    setFailed(null);
    onClose();
  };

  const decide = async (decision: "approve" | "discard") => {
    setFailed(null);
    try {
      await (decision === "approve" ? approve : discard).mutateAsync(bundle.id);
      toast.show({
        tone: "success",
        title: t(decision === "approve" ? "m84.bundle.approvedDone" : "m84.bundle.discardedDone"),
      });
      close();
    } catch (e) {
      setConfirmDiscard(false);
      setFailed(e instanceof ApiRequestError && e.status === 409 ? "conflict" : "other");
    }
  };

  const footer = confirmDiscard ? (
    <>
      <p className="me-auto self-center text-body-sm text-text-primary">
        {t("m84.bundle.discardConfirm")}
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => setConfirmDiscard(false)}>
        {t("common.cancel")}
      </Button>
      <Button variant="danger" loading={discard.isPending} onClick={() => void decide("discard")}>
        {t("m84.bundle.discardYes")}
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" disabled={busy} onClick={close}>
        {t("common.cancel")}
      </Button>
      <Button
        variant="danger"
        disabled={!content.isSuccess || busy}
        onClick={() => setConfirmDiscard(true)}
      >
        {t("m84.bundle.discard")}
      </Button>
      <Button
        disabled={!content.isSuccess || busy}
        loading={approve.isPending}
        onClick={() => void decide("approve")}
      >
        {t("m84.bundle.approve")}
      </Button>
    </>
  );

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(open) => !open && !busy && close()}
      title={t("m84.bundle.reviewTitle")}
      description={t("m84.bundle.reviewIntro")}
      footer={footer}
    >
      <div className="space-y-3">
        {content.isPending ? (
          <Skeleton className="h-64" />
        ) : content.isError ? (
          <div className="space-y-2">
            <p role="alert" className="text-body-sm text-danger-text">
              {t("m84.bundle.loadFailed")}
            </p>
            <Button variant="secondary" size="sm" onClick={() => void content.refetch()}>
              {t("common.retry")}
            </Button>
          </div>
        ) : (
          // A read-only text area: scrollable, reachable by keyboard and announced as read-only text.
          <Textarea
            label={t("m84.bundle.content")}
            readOnly
            rows={14}
            value={content.data.content}
            className="whitespace-pre-wrap break-words bg-bg-raised font-mono text-body-sm"
          />
        )}
        {failed && (
          <p role="alert" className="text-body-sm text-danger-text">
            {t(failed === "conflict" ? "m84.bundle.decideConflict" : "m84.bundle.decideFailed")}
          </p>
        )}
      </div>
    </Modal>
  );
}
