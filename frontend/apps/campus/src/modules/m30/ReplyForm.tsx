import { zodResolver } from "@hookform/resolvers/zod";
import { DiscussionPostInputSchema, type DiscussionPostInput } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { ApiRequestError, useCreateDiscussionPost } from "@nexus/services";
import { Button, Textarea, useToast } from "@nexus/ui-core";
import { Send } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";

const MAX_BODY = 5000;

export interface ReplyFormProps {
  readonly threadId: string;
  readonly courseSpaceId?: string;
  readonly parentPostId: string | null;
  readonly onSuccess?: () => void;
  readonly onCancel?: () => void;
}

const SERVER_KEYS: ReadonlySet<string> = new Set([
  "m30.reply.invalidBody",
  "m30.reply.invalidParent",
  "m30.reply.lockedError",
  "m30.reply.unavailable",
  "m30.reply.failed",
]);

function isServerKey(value: string | undefined): value is MessageKey {
  return value !== undefined && SERVER_KEYS.has(value);
}

/**
 * Discussion reply form (react-hook-form + Zod on DiscussionPostInputSchema) using the L2 outbox.
 * Shows an inline queued notice when submitted offline and never leaks post text into errors.
 */
export function ReplyForm({
  threadId,
  courseSpaceId,
  parentPostId,
  onSuccess,
  onCancel,
}: ReplyFormProps) {
  const t = useText();
  const { locale } = useRuntime();
  const toast = useToast();
  const online = useOnline();
  const createPost = useCreateDiscussionPost();
  const [queuedNotice, setQueuedNotice] = useState(false);

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<DiscussionPostInput>({
    resolver: zodResolver(DiscussionPostInputSchema),
    defaultValues: { parentPostId, body: "" },
  });

  const bodyValue = watch("body");

  const onSubmit = handleSubmit(async (data) => {
    setQueuedNotice(false);
    clearErrors("root");
    try {
      const result = await createPost.mutateAsync({
        threadId,
        ...(courseSpaceId ? { courseSpaceId } : {}),
        input: { parentPostId, body: data.body },
      });
      reset({ parentPostId, body: "" });
      if (result.queued) {
        setQueuedNotice(true);
        toast.show({ tone: "info", title: t("m30.reply.queued") });
      } else {
        toast.show({ tone: "success", title: t("m30.reply.posted") });
        onSuccess?.();
      }
    } catch (error) {
      if (error instanceof ApiRequestError) {
        if (error.error.code === "conflict") {
          setError("root", { type: "server", message: "m30.reply.lockedError" });
          return;
        }
        if (error.error.code === "invalid_request") {
          const badParent = error.error.details?.some((d) => d.path === "parentPostId");
          if (badParent) {
            setError("root", { type: "server", message: "m30.reply.invalidParent" });
          } else {
            setError("body", { type: "server", message: "m30.reply.invalidBody" });
          }
          return;
        }
        if (error.error.code === "not_found" || error.error.code === "forbidden") {
          setError("root", { type: "server", message: "m30.reply.unavailable" });
          return;
        }
      }
      setError("root", { type: "server", message: "m30.reply.failed" });
    }
  });

  const rootError = errors.root
    ? t(isServerKey(errors.root.message) ? errors.root.message : "m30.reply.failed")
    : undefined;

  let bodyError: string | undefined;
  if (errors.body) {
    if (errors.body.type === "server" && isServerKey(errors.body.message)) {
      bodyError = t(errors.body.message);
    } else if (bodyValue.trim().length === 0) {
      bodyError = t("m30.reply.required");
    } else if (bodyValue.trim().length > MAX_BODY) {
      bodyError = t("m30.reply.tooLong", { max: formatNumber(MAX_BODY, safeLocale) });
    } else {
      bodyError = t("m30.reply.invalidBody");
    }
  }

  return (
    <form onSubmit={(e) => void onSubmit(e)} noValidate className="space-y-3">
      {rootError && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-body-sm font-medium text-danger-text"
        >
          {rootError}
        </p>
      )}
      {queuedNotice && (
        <p
          role="status"
          className="rounded-md border border-info bg-info-subtle px-3 py-2 text-body-sm font-medium text-info-text"
        >
          {t("m30.reply.queued")}
        </p>
      )}
      <Textarea
        label={t(parentPostId === null ? "m30.reply.threadLabel" : "m30.reply.postLabel")}
        placeholder={t("m30.reply.placeholder")}
        rows={3}
        required
        description={t("m30.reply.counter", {
          count: formatNumber(bodyValue.length, safeLocale),
          max: formatNumber(MAX_BODY, safeLocale),
        })}
        error={bodyError}
        {...register("body", {
          onChange: () => {
            if (queuedNotice) setQueuedNotice(false);
          },
        })}
      />
      {!online && (
        <p role="status" className="text-body-sm text-text-secondary">
          {t("m30.reply.offlineHint")}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="secondary" size="sm" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        )}
        <Button type="submit" size="sm" loading={createPost.isPending}>
          <Send className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{t("m30.reply.submit")}</span>
        </Button>
      </div>
    </form>
  );
}
