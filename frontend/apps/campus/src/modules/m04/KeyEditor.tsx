import {
  formatMessagePreview,
  getDirection,
  MESSAGE_DESCRIPTIONS,
  MESSAGE_LAYERS,
  useText,
  validateMessage,
  type MessageExplanation,
  type MessageKey,
  type MessageLayer,
} from "@nexus/i18n";
import { useDeleteOverride, useSaveOverride } from "@nexus/services";
import { Badge, Button, Modal, Textarea, useToast } from "@nexus/ui-core";
import { Lock, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { HistoryPanel } from "./HistoryPanel";

export interface KeyEditorProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly messageKey: MessageKey;
  readonly locale: string;
  readonly localeLabel: string;
  readonly explanation: MessageExplanation;
  readonly lockedByGroup: boolean;
  readonly hasInstitutionOverride: boolean;
  readonly online: boolean;
}

const LAYER_LABEL_KEYS: Readonly<Record<MessageLayer, MessageKey>> = {
  platform: "m04.editor.layerPlatform",
  terminology: "m04.editor.layerTerminology",
  group: "m04.editor.layerGroup",
  institution: "m04.editor.layerInstitution",
  campus: "m04.editor.layerCampus",
};

/** Modal editor for one message key: layer breakdown, ICU validation, preview, save/remove, history. */
export function KeyEditor({
  open,
  onOpenChange,
  messageKey,
  locale,
  localeLabel,
  explanation,
  lockedByGroup,
  hasInstitutionOverride,
  online,
}: KeyEditorProps) {
  const t = useText();
  const toast = useToast();
  const saveOverride = useSaveOverride();
  const deleteOverride = useDeleteOverride();

  const initialDraft = explanation.layers.institution ?? "";
  const [draft, setDraft] = useState(initialDraft);

  useEffect(() => {
    setDraft(explanation.layers.institution ?? "");
  }, [messageKey, locale, explanation.layers.institution]);

  const trimmed = draft.trim();
  const validation = useMemo(
    () => (trimmed.length > 0 ? validateMessage(trimmed) : null),
    [trimmed],
  );
  const icuError =
    draft.length > 0 && trimmed.length === 0
      ? t("m04.editor.emptyError")
      : validation && !validation.valid
        ? t("m04.editor.icuInvalid", { reason: validation.error })
        : undefined;

  const previewSource = trimmed.length > 0 ? trimmed : explanation.resolved;
  const preview = useMemo(
    () => formatMessagePreview(previewSource, locale),
    [previewSource, locale],
  );
  const isDirty = trimmed !== initialDraft.trim();
  const canSave =
    online &&
    !lockedByGroup &&
    isDirty &&
    trimmed.length > 0 &&
    icuError === undefined &&
    !saveOverride.isPending;

  const textDir = getDirection(locale);
  const description = MESSAGE_DESCRIPTIONS[messageKey];

  const handleSave = async () => {
    if (!canSave) return;
    try {
      const result = await saveOverride.mutateAsync({
        key: messageKey,
        locale,
        message: trimmed,
      });
      if (result.queued) {
        toast.show({ tone: "warning", title: t("m04.studio.offlineNotice") });
        return;
      }
      toast.show({ tone: "success", title: t("m04.editor.savedToast") });
      onOpenChange(false);
    } catch {
      toast.show({ tone: "danger", title: t("m04.editor.saveFailedToast") });
    }
  };

  const handleRemove = async () => {
    if (!online || lockedByGroup || !hasInstitutionOverride) return;
    try {
      const result = await deleteOverride.mutateAsync({ key: messageKey, locale });
      if (result.queued) {
        toast.show({ tone: "warning", title: t("m04.studio.offlineNotice") });
        return;
      }
      toast.show({ tone: "success", title: t("m04.editor.removedToast") });
      onOpenChange(false);
    } catch {
      toast.show({ tone: "danger", title: t("m04.editor.removeFailedToast") });
    }
  };

  const footer = (
    <div className="flex w-full flex-wrap items-center justify-between gap-2">
      <div>
        {hasInstitutionOverride && !lockedByGroup && (
          <Button
            type="button"
            variant="danger"
            disabled={!online || deleteOverride.isPending}
            loading={deleteOverride.isPending}
            onClick={() => void handleRemove()}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span>{t("m04.editor.removeOverride")}</span>
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
          {t("common.cancel")}
        </Button>
        {!lockedByGroup && (
          <Button
            type="button"
            variant="primary"
            disabled={!canSave}
            loading={saveOverride.isPending}
            onClick={() => void handleSave()}
          >
            {t("common.save")}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t(lockedByGroup ? "m04.editor.titleReadOnly" : "m04.editor.title")}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-body-sm text-text-primary">{messageKey}</code>
          <Badge tone="neutral">{localeLabel}</Badge>
        </span>
      }
      footer={footer}
    >
      <div className="space-y-5">
        <p className="text-body-sm text-text-secondary">{description}</p>

        {lockedByGroup && (
          <div
            role="note"
            className="flex items-start gap-2 rounded-md border border-border-default bg-warning-subtle px-3 py-2.5 text-body-sm text-warning-text"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{t("m04.editor.groupLockedNotice")}</span>
          </div>
        )}

        <section aria-labelledby="m04-layers-heading" className="space-y-2">
          <div>
            <h3
              id="m04-layers-heading"
              className="font-sans text-body-sm font-semibold text-text-primary"
            >
              {t("m04.editor.layersHeading")}
            </h3>
            <p className="text-caption text-text-muted">{t("m04.editor.layersHint")}</p>
          </div>
          <dl className="divide-y divide-border-subtle rounded-md border border-border-default bg-bg-subtle">
            {MESSAGE_LAYERS.map((layer) => {
              const value = explanation.layers[layer];
              const isWinner = explanation.winner === layer;
              return (
                <div
                  key={layer}
                  className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-2 text-body-sm"
                >
                  <dt className="flex items-center gap-2 font-medium text-text-secondary">
                    <span>{t(LAYER_LABEL_KEYS[layer])}</span>
                    {isWinner && <Badge tone="brand">{t("m04.editor.layerActive")}</Badge>}
                  </dt>
                  <dd
                    dir={value !== null ? textDir : undefined}
                    className={
                      value !== null
                        ? "min-w-0 break-words text-text-primary"
                        : "italic text-text-muted"
                    }
                  >
                    {value ?? t("m04.editor.layerNotSet")}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>

        <Textarea
          label={t("m04.editor.overrideLabel")}
          description={t("m04.editor.overrideHint")}
          placeholder={t("m04.editor.overridePlaceholder")}
          value={draft}
          dir={textDir}
          disabled={lockedByGroup}
          error={icuError}
          onChange={(event) => setDraft(event.target.value)}
        />

        <section
          aria-labelledby="m04-preview-heading"
          className="space-y-1.5 rounded-md border border-border-default bg-bg-subtle p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3
              id="m04-preview-heading"
              className="font-sans text-body-sm font-semibold text-text-primary"
            >
              {t("m04.editor.previewHeading")}
            </h3>
            {preview.ok && preview.placeholders.length > 0 && (
              <span className="text-caption text-text-muted">
                {t("m04.editor.previewSampleNote")}
              </span>
            )}
          </div>
          {preview.ok ? (
            <p
              data-testid="m04-preview-output"
              dir={textDir}
              className="break-words text-body text-text-primary"
            >
              {preview.rendered}
            </p>
          ) : (
            <p data-testid="m04-preview-error" className="text-body-sm text-danger-text">
              {t("m04.editor.previewError")}
            </p>
          )}
        </section>

        <HistoryPanel
          messageKey={messageKey}
          locale={locale}
          lockedByGroup={lockedByGroup}
          online={online}
          onRolledBack={(override) => setDraft(override?.message ?? "")}
        />
      </div>
    </Modal>
  );
}
