import { IssuedDocumentRevokeInputSchema, type IssuedDocumentRead } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { ApiRequestError, useRevokeIssuedDocument } from "@nexus/services";
import { Button, Modal, Textarea, useToast } from "@nexus/ui-core";
import { useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";

const MAX_REASON = 300;

interface Props {
  readonly document: IssuedDocumentRead;
}

export function RevokeDialog({ document }: Props) {
  const t = useText();
  const toast = useToast();
  const online = useOnline();
  const { locale } = useRuntime();
  const local = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const revoke = useRevokeIssuedDocument(document.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<"required" | "tooLong" | null>(null);

  const errorStatus = revoke.error instanceof ApiRequestError ? revoke.error.status : null;
  const fieldError =
    validationError === "required"
      ? t("common.required")
      : validationError === "tooLong"
        ? t("m23.revoke.tooLong", { max: formatNumber(MAX_REASON, local) })
        : errorStatus === 400
          ? t("m23.revoke.invalidReason")
          : undefined;

  function submit() {
    if (!online || document.revoked || revoke.isPending) return;
    const trimmed = reason.trim();
    if (!trimmed) {
      setValidationError("required");
      return;
    }
    if (trimmed.length > MAX_REASON) {
      setValidationError("tooLong");
      return;
    }
    const parsed = IssuedDocumentRevokeInputSchema.safeParse({ reason });
    if (!parsed.success) {
      setValidationError("required");
      return;
    }
    setValidationError(null);
    revoke.mutate(parsed.data, {
      onSuccess: () => {
        setOpen(false);
        setReason("");
        toast.show({ tone: "success", title: t("m23.revoke.saved") });
      },
    });
  }

  return (
    <>
      {!document.revoked && (
        <Button
          className="min-h-11"
          variant="danger"
          disabled={!online}
          onClick={() => {
            revoke.reset();
            setReason("");
            setValidationError(null);
            setOpen(true);
          }}
        >
          {t("m23.revoke.action")}
        </Button>
      )}
      {!document.revoked && !online && <p role="status">{t("common.offline")}</p>}
      {open && (
        <Modal
          open
          title={t("m23.revoke.title")}
          onOpenChange={(next) => {
            if (!next && !revoke.isPending) setOpen(false);
          }}
          footer={
            <>
              <Button
                className="min-h-11"
                variant="secondary"
                disabled={revoke.isPending}
                onClick={() => setOpen(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                className="min-h-11"
                variant="danger"
                disabled={!online || document.revoked}
                loading={revoke.isPending}
                onClick={submit}
              >
                {t("m23.revoke.confirmAction")}
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-body text-text-secondary">{t("m23.revoke.confirm")}</p>
            <Textarea
              label={t("m23.revoke.reason")}
              required
              maxLength={MAX_REASON}
              disabled={document.revoked || revoke.isPending}
              value={reason}
              description={t("m23.revoke.counter", {
                count: formatNumber(reason.length, local),
                max: formatNumber(MAX_REASON, local),
              })}
              error={fieldError}
              onChange={(event) => {
                setReason(event.target.value);
                if (validationError) setValidationError(null);
                if (errorStatus === 400) revoke.reset();
              }}
            />
            {!online && <p role="status">{t("common.offline")}</p>}
            {revoke.isError && errorStatus !== 400 && (
              <p role="alert" className="text-body-sm text-danger-text">
                {t(
                  errorStatus === 403
                    ? "common.shell.forbiddenTitle"
                    : errorStatus === 409
                      ? "m23.revoke.conflict"
                      : "m23.revoke.failed",
                )}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
