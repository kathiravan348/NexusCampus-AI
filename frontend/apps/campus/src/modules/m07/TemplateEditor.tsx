import type { NotificationTemplate } from "@nexus/contracts";
import {
  formatMessagePreview,
  getDirection,
  isPseudoLocale,
  isValidMessage,
  useText,
} from "@nexus/i18n";
import { ApiRequestError, useSaveTemplate } from "@nexus/services";
import { Button, Input, Modal, Select, Textarea, useToast } from "@nexus/ui-core";
import { useEffect, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { CHANNEL_KEY, EVENT_KEY } from "./notifyShared";

export interface TemplateEditorProps {
  /** All locale versions of one event + channel; the first is opened. */
  readonly versions: readonly NotificationTemplate[];
  readonly onClose: () => void;
  readonly online: boolean;
}

const NEW = "__new__";

/** Edit one event + channel per locale with ICU validation and a sample-values preview (G-1, C-3). */
export function TemplateEditor({ versions, onClose, online }: TemplateEditorProps) {
  const t = useText();
  const toast = useToast();
  const { supportedLocales } = useRuntime();
  const save = useSaveTemplate();
  const first = versions[0]!;
  const missing = supportedLocales.filter(
    (l) => !isPseudoLocale(l) && !versions.some((v) => v.locale === l),
  );
  const [selected, setSelected] = useState<string>(first.locale);
  const [newLocale, setNewLocale] = useState(missing[0] ?? "");
  const current = versions.find((v) => v.locale === selected) ?? null;
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    setSubject(current?.subject ?? first.subject ?? "");
    setBody(current?.body ?? first.body);
  }, [current, first]);

  const isEmail = first.channel === "email";
  const locale = current?.locale ?? newLocale;
  const bodyOk = body.trim().length > 0 && isValidMessage(body);
  const subjectOk = !isEmail || (subject.trim().length > 0 && isValidMessage(subject));
  const preview = bodyOk ? formatMessagePreview(body, locale) : null;

  const onSave = async () => {
    const data = {
      subject: isEmail ? subject.trim() : null,
      body: body.trim(),
      enabled: current?.enabled ?? true,
    };
    try {
      await save.mutateAsync(
        current
          ? { id: current.id, data }
          : {
              data: {
                ...data,
                eventType: first.eventType,
                channel: first.channel,
                locale: newLocale,
              },
            },
      );
      toast.show({ tone: "success", title: t("m07.editor.saved") });
      onClose();
    } catch (e) {
      const dup = e instanceof ApiRequestError && e.error.code === "conflict";
      toast.show({
        tone: "danger",
        title: t(dup ? "m07.editor.duplicate" : "m07.notifications.saveFailed"),
      });
    }
  };

  const event = EVENT_KEY[first.eventType] ? t(EVENT_KEY[first.eventType]!) : first.eventType;

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(o) => !o && onClose()}
      title={t("m07.editor.title", { event, channel: t(CHANNEL_KEY[first.channel]) })}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!online || !bodyOk || !subjectOk || (!current && !newLocale)}
            loading={save.isPending}
            onClick={() => void onSave()}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Select
          label={t("m07.editor.language")}
          options={[
            ...versions.map((v) => ({ value: v.locale, label: v.locale })),
            ...(missing.length > 0 ? [{ value: NEW, label: t("m07.editor.addLanguage") }] : []),
          ]}
          value={current ? selected : NEW}
          onChange={(e) => setSelected(e.target.value)}
          containerClassName="max-w-xs"
        />
        {!current && (
          <Select
            label={t("m07.editor.newLanguage")}
            options={missing.map((l) => ({ value: l, label: l }))}
            value={newLocale}
            onChange={(e) => setNewLocale(e.target.value)}
            containerClassName="max-w-xs"
          />
        )}
        {isEmail && (
          <Input
            label={t("m07.editor.subject")}
            dir={getDirection(locale)}
            value={subject}
            error={subjectOk ? undefined : t("m07.editor.invalid")}
            onChange={(e) => setSubject(e.target.value)}
          />
        )}
        <Textarea
          label={t("m07.editor.body")}
          dir={getDirection(locale)}
          rows={5}
          value={body}
          error={bodyOk ? undefined : t("m07.editor.invalid")}
          onChange={(e) => setBody(e.target.value)}
        />
        <section aria-labelledby="tpl-preview" className="space-y-1">
          <h3 id="tpl-preview" className="text-label uppercase text-text-muted">
            {t("m07.editor.preview")}
          </h3>
          <p
            lang={locale}
            dir={getDirection(locale)}
            className="rounded-md border border-border-default bg-bg-raised p-3 text-body"
          >
            {preview?.ok ? preview.rendered : t("m07.editor.noPreview")}
          </p>
        </section>
      </div>
    </Modal>
  );
}
