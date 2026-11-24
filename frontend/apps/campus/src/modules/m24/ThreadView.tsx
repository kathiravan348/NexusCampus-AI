import { ThreadMessageInputSchema, type MessageThread } from "@nexus/contracts";
import { formatDateTime, formatNumber, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import {
  ApiRequestError,
  usePeople,
  useThreadMessages,
  type useSendThreadMessage,
} from "@nexus/services";
import { Badge, Button, EmptyState, Textarea } from "@nexus/ui-core";
import { useRef, useState, type FormEvent } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { THREAD_KIND_KEYS } from "./ThreadList";

const MAX_BODY = 4000;

export interface ThreadViewProps {
  readonly thread: MessageThread;
  readonly viewerPersonId: string;
  readonly canSend: boolean;
  readonly writer: ReturnType<typeof useSendThreadMessage>;
}

export function ThreadView({ thread, viewerPersonId, canSend, writer }: ThreadViewProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const messages = useThreadMessages(thread.id);
  const people = usePeople();
  const [body, setBody] = useState("");
  const [validationError, setValidationError] = useState<"required" | "tooLong" | null>(null);
  const [sendError, setSendError] = useState<"archived" | "invalid" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  if (messages.error instanceof ApiRequestError && messages.error.status === 404) {
    return <EmptyState title={t("m24.thread.unavailable")} />;
  }
  if (messages.isError && !messages.data) {
    return (
      <EmptyState
        tone="error"
        title={t("m24.thread.error")}
        action={
          <Button className="min-h-11" variant="secondary" onClick={() => void messages.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!messages.data) {
    return <p role="status">{t("common.loading")}</p>;
  }

  const personNames = new Map(
    (people.isError ? [] : people.data?.items)?.map((person) => [
      person.id,
      person.preferredName || person.legalName,
    ]),
  );

  function senderLabel(senderPersonId: string): string {
    if (senderPersonId === viewerPersonId) return t("m24.thread.you");
    return personNames.get(senderPersonId) ?? t("m24.thread.member");
  }

  const sorted = [...messages.data.items].sort(
    (a, b) => Date.parse(a.sentAt) - Date.parse(b.sentAt) || a.id.localeCompare(b.id),
  );
  const pending = writer.pendingMessages;

  const fieldError =
    validationError === "required"
      ? t("common.required")
      : validationError === "tooLong"
        ? t("m24.reply.tooLong", { max: formatNumber(MAX_BODY, safeLocale) })
        : sendError === "invalid"
          ? t("m24.reply.invalidBody")
          : undefined;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !canSend || thread.archived) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setValidationError("required");
      return;
    }
    if (trimmed.length > MAX_BODY) {
      setValidationError("tooLong");
      return;
    }
    const parsed = ThreadMessageInputSchema.safeParse({ body });
    if (!parsed.success) {
      setValidationError("required");
      return;
    }
    setValidationError(null);
    setSendError(null);
    submitting.current = true;
    setBusy(true);
    try {
      await writer.sendMessage(parsed.data);
      setBody("");
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.status === 409) setSendError("archived");
        else if (error.status === 400) setSendError("invalid");
        else setSendError("failed");
      } else {
        setSendError("failed");
      }
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <section className="min-w-0 space-y-4 break-words">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <h2 className="text-section-title font-semibold break-words text-text-primary">
            {thread.subject}
          </h2>
          <p className="text-body-sm text-text-secondary">{t(THREAD_KIND_KEYS[thread.kind])}</p>
        </div>
        {thread.archived && <Badge tone="neutral">{t("m24.threads.archived")}</Badge>}
      </header>

      {writer.replayFailed && (
        <p role="alert" className="text-body-sm text-danger-text">
          {t("m24.reply.replayFailed")}
        </p>
      )}

      {sorted.length === 0 && pending.length === 0 ? (
        <EmptyState title={t("m24.thread.empty")} />
      ) : (
        <ol aria-label={t("m24.thread.messagesLabel")} className="space-y-3">
          {sorted.map((message) => (
            <li
              key={message.id}
              className="min-w-0 space-y-2 rounded-lg border border-border-default bg-bg-surface p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
                <span className="break-words font-semibold text-text-primary">
                  {senderLabel(message.senderPersonId)}
                </span>
                <time dateTime={message.sentAt}>
                  {formatDateTime(message.sentAt, { locale: safeLocale, timeZone })}
                </time>
                {message.editedAt !== null && <span>{t("m24.thread.edited")}</span>}
              </div>
              <p className="whitespace-pre-wrap break-words text-body text-text-primary">
                {message.body}
              </p>
            </li>
          ))}
          {pending.map((item) => (
            <li
              key={item.clientId}
              className="min-w-0 space-y-2 rounded-lg border border-border-default bg-bg-raised p-4"
            >
              <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
                <span className="font-semibold text-text-primary">{t("m24.thread.you")}</span>
                {item.state === "failed" ? (
                  <Badge tone="danger">{t("m24.reply.notSent")}</Badge>
                ) : (
                  <Badge tone="warning">{t("m24.reply.waiting")}</Badge>
                )}
              </div>
              <p className="whitespace-pre-wrap break-words text-body text-text-primary">
                {item.input.body}
              </p>
            </li>
          ))}
        </ol>
      )}

      {thread.archived ? (
        <p className="text-body-sm text-text-secondary">{t("m24.thread.archivedNote")}</p>
      ) : canSend ? (
        <form
          noValidate
          className="space-y-3 rounded-lg border border-border-default bg-bg-surface p-4"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <Textarea
            label={t("m24.reply.label")}
            required
            maxLength={MAX_BODY}
            disabled={busy}
            value={body}
            description={t("m24.reply.counter", {
              count: formatNumber(body.length, safeLocale),
              max: formatNumber(MAX_BODY, safeLocale),
            })}
            error={fieldError}
            onChange={(event) => {
              setBody(event.target.value);
              if (validationError) setValidationError(null);
              if (sendError) setSendError(null);
            }}
          />
          {(sendError === "archived" || sendError === "failed") && (
            <p role="alert" className="text-body-sm text-danger-text">
              {t(sendError === "archived" ? "m24.reply.archivedError" : "m24.reply.notSent")}
            </p>
          )}
          <Button type="submit" className="min-h-11" disabled={busy} loading={busy}>
            {t("m24.reply.send")}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
