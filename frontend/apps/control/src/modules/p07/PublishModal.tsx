import type { Release } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { usePublishRelease } from "@nexus/services/control";
import { Button, Checkbox, Modal, useToast } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { CHANNEL_KEY } from "../p06/labels";

/** Signs and publishes a draft. AI-drafted notes need a person to confirm they reviewed them (A-1). */
export function PublishModal({
  release,
  onClose,
}: {
  readonly release: Release;
  readonly onClose: () => void;
}) {
  const t = useControlText();
  const toast = useToast();
  const publish = usePublishRelease();
  const [reviewed, setReviewed] = useState(false);
  const blocked = release.notesAiDrafted && !reviewed;

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("p07.publishTitle", { version: release.version })}
      description={t("p07.publishBody", { channel: t(CHANNEL_KEY[release.channel]) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={blocked || publish.isPending}
            onClick={() =>
              publish.mutate(
                { id: release.id, notesReviewed: reviewed },
                {
                  onSuccess: () => {
                    toast.show({ tone: "success", title: t("p07.published") });
                    onClose();
                  },
                  onError: () => toast.show({ tone: "danger", title: t("p07.publishFailed") }),
                },
              )
            }
          >
            {t("p07.publish")}
          </Button>
        </>
      }
    >
      {release.notesAiDrafted && (
        <div className="space-y-3">
          <p className="flex items-start gap-2 rounded-md bg-warning-subtle p-3 text-body-sm text-warning-text">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t("p07.publishAiWarning")}
          </p>
          <Checkbox
            label={t("p07.publishChecked")}
            checked={reviewed}
            onCheckedChange={(value) => setReviewed(value === true)}
          />
        </div>
      )}
    </Modal>
  );
}
