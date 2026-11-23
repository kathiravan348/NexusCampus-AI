import { useText } from "@nexus/i18n";
import { Button, Modal, Skeleton, Textarea } from "@nexus/ui-core";
import { useState } from "react";

export type BundleDecision = "approve" | "discard";
export type BundleDecisionError = "conflict" | "offline" | "other";

const DECISION_ERRORS = {
  conflict: "m84.bundle.decideConflict",
  offline: "m84.bundle.needsConnection",
  other: "m84.bundle.decideFailed",
} as const;

export interface BundleReviewModalProps {
  readonly content: string | undefined;
  readonly loadError: "offline" | "other" | null;
  readonly pendingDecision: BundleDecision | null;
  readonly onRetry: () => void;
  readonly onDecide: (decision: BundleDecision) => Promise<BundleDecisionError | null>;
  readonly onClose: () => void;
}

/**
 * Shows exactly the text a support diagnostic bundle would send, then lets the admin approve sending or discard it
 * (V-6, NEX-144). Both choices are final, so Discard asks once more; nothing can be approved before the text loaded.
 */
export function BundleReviewModal({
  content,
  loadError,
  pendingDecision,
  onRetry,
  onDecide,
  onClose,
}: BundleReviewModalProps) {
  const t = useText();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [failed, setFailed] = useState<BundleDecisionError | null>(null);

  const busy = pendingDecision !== null;
  const cannotDecide = content === undefined || loadError !== null || busy || failed === "conflict";

  const decide = async (decision: BundleDecision) => {
    setFailed(null);
    const error = await onDecide(decision);
    if (!error) {
      onClose();
      return;
    }
    setConfirmDiscard(false);
    setFailed(error);
  };

  const footer = confirmDiscard ? (
    <>
      <p className="me-auto self-center text-body-sm text-text-primary">
        {t("m84.bundle.discardConfirm")}
      </p>
      <Button variant="secondary" disabled={busy} onClick={() => setConfirmDiscard(false)}>
        {t("common.cancel")}
      </Button>
      <Button
        variant="danger"
        disabled={cannotDecide}
        loading={pendingDecision === "discard"}
        onClick={() => void decide("discard")}
      >
        {t("m84.bundle.discardYes")}
      </Button>
    </>
  ) : (
    <>
      <Button variant="secondary" disabled={busy} onClick={onClose}>
        {t("common.cancel")}
      </Button>
      <Button variant="danger" disabled={cannotDecide} onClick={() => setConfirmDiscard(true)}>
        {t("m84.bundle.discard")}
      </Button>
      <Button
        disabled={cannotDecide}
        loading={pendingDecision === "approve"}
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
      onOpenChange={(open) => !open && !busy && onClose()}
      title={t("m84.bundle.reviewTitle")}
      description={t("m84.bundle.reviewIntro")}
      footer={footer}
    >
      <div className="space-y-3">
        {loadError ? (
          <div className="space-y-2">
            <p role="alert" className="text-body-sm text-danger-text">
              {t(loadError === "offline" ? "m84.bundle.needsConnection" : "m84.bundle.loadFailed")}
            </p>
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t("common.retry")}
            </Button>
          </div>
        ) : content === undefined ? (
          <Skeleton className="h-64" />
        ) : (
          // A read-only text area: scrollable, reachable by keyboard and announced as read-only text.
          <Textarea
            label={t("m84.bundle.content")}
            readOnly
            rows={14}
            value={content}
            className="whitespace-pre-wrap break-words bg-bg-raised font-mono text-body-sm"
          />
        )}
        {failed && (
          <p role="alert" className="text-body-sm text-danger-text">
            {t(DECISION_ERRORS[failed])}
          </p>
        )}
      </div>
    </Modal>
  );
}
