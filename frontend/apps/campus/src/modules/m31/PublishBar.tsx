import type { ContentItem } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import {
  ApiRequestError,
  useCheckContentAccessibility,
  usePublishContentItem,
} from "@nexus/services";
import { Button, Card, useToast } from "@nexus/ui-core";
import { AlertCircle, CheckCircle2, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useState } from "react";
import { useOnline } from "../../app/RouteGuard";

export interface PublishBarProps {
  readonly item: ContentItem;
  readonly canManage: boolean;
  readonly canPublish: boolean;
}

function mapActionError(error: unknown): MessageKey {
  if (error instanceof ApiRequestError) {
    if (error.error.code === "conflict") {
      if (error.error.details?.some((detail) => detail.path === "accessibility")) {
        return "m31.publish.fixErrors";
      }
      return "m31.publish.statusConflict";
    }
    if (error.error.code === "forbidden") {
      return "m31.publish.forbidden";
    }
  }
  return "m31.publish.failed";
}

/**
 * Action bar for running the M31 accessibility check and publishing a content item via the L2
 * outbox. Disables publishing while accessibility errors remain and shows an inline queued notice
 * offline without exposing item text or personal data in errors.
 */
export function PublishBar({ item, canManage, canPublish }: PublishBarProps) {
  const t = useText();
  const online = useOnline();
  const toast = useToast();
  const checkMutation = useCheckContentAccessibility();
  const publishMutation = usePublishContentItem();
  const [errorKey, setErrorKey] = useState<MessageKey | null>(null);
  const [queuedKey, setQueuedKey] = useState<MessageKey | null>(null);

  if (!canManage && !canPublish) return null;

  const hasErrors = item.accessibility?.issues.some((issue) => issue.severity === "error") ?? false;
  const isPublishableStatus = item.status === "draft" || item.status === "in_review";
  const showFixErrors = canPublish && isPublishableStatus && hasErrors;
  const busy = checkMutation.isPending || publishMutation.isPending;

  async function handleRunCheck() {
    setErrorKey(null);
    setQueuedKey(null);
    try {
      const result = await checkMutation.mutateAsync(item.id);
      if (result.queued) {
        setQueuedKey("m31.publish.checkQueued");
        toast.show({ tone: "info", title: t("m31.publish.checkQueued") });
      } else {
        toast.show({ tone: "success", title: t("m31.publish.checkDone") });
      }
    } catch (error) {
      setErrorKey(mapActionError(error));
    }
  }

  async function handlePublish() {
    setErrorKey(null);
    setQueuedKey(null);
    try {
      const result = await publishMutation.mutateAsync(item.id);
      if (result.queued) {
        setQueuedKey("m31.publish.publishQueued");
        toast.show({ tone: "info", title: t("m31.publish.publishQueued") });
      } else {
        toast.show({ tone: "success", title: t("m31.publish.published") });
      }
    } catch (error) {
      setErrorKey(mapActionError(error));
    }
  }

  return (
    <Card headingAs="h3" title={t("m31.publish.heading")}>
      <div className="space-y-3">
        {errorKey && (
          <p
            role="alert"
            className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm font-medium text-danger-text"
          >
            {t(errorKey)}
          </p>
        )}

        {queuedKey && (
          <p
            role="status"
            className="rounded-md border border-info bg-info-subtle px-3 py-2 text-body-sm font-medium text-info-text"
          >
            {t(queuedKey)}
          </p>
        )}

        {showFixErrors && errorKey !== "m31.publish.fixErrors" && (
          <p className="inline-flex items-center gap-2 text-body-sm font-medium text-danger-text">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("m31.publish.fixErrors")}</span>
          </p>
        )}

        {item.aiAssisted && isPublishableStatus && (
          <p className="inline-flex items-center gap-2 text-body-sm text-text-secondary">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("m31.publish.aiHumanReview")}</span>
          </p>
        )}

        {item.status === "published" && (
          <p className="inline-flex items-center gap-2 text-body-sm text-success-text">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("m31.publish.alreadyPublished")}</span>
          </p>
        )}

        {item.status === "archived" && (
          <p className="text-body-sm text-text-secondary">{t("m31.publish.archivedNote")}</p>
        )}

        {!online && (
          <p role="status" className="text-body-sm text-text-secondary">
            {t("m31.publish.offlineHint")}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              loading={checkMutation.isPending}
              onClick={() => void handleRunCheck()}
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("m31.publish.runCheck")}</span>
            </Button>
          )}

          {canPublish && isPublishableStatus && (
            <Button
              type="button"
              size="sm"
              disabled={hasErrors || busy}
              loading={publishMutation.isPending}
              onClick={() => void handlePublish()}
            >
              <Upload className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("m31.publish.publish")}</span>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
