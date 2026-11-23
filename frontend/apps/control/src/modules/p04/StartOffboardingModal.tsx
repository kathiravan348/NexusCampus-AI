import { useControlText } from "@nexus/i18n/control";
import { ApiRequestError } from "@nexus/services";
import { useAccounts, useStartOffboarding } from "@nexus/services/control";
import { Button, Checkbox, EmptyState, Modal, Select, Textarea, useToast } from "@nexus/ui-core";
import { useMemo, useState } from "react";

/** Starts offboarding a SaaS tenant: freeze writes and export for the institution's pasted RSA public key (D61). */
export function StartOffboardingModal({ onClose }: { readonly onClose: () => void }) {
  const t = useControlText();
  const toast = useToast();
  const accounts = useAccounts();
  const start = useStartOffboarding();

  const eligible = useMemo(
    () =>
      (accounts.data?.items ?? []).filter(
        (a) => a.deliveryModel !== "self_hosted" && a.tenantIds.length > 0,
      ),
    [accounts.data],
  );

  const [accountId, setAccountId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [recipientPem, setRecipientPem] = useState("");
  const [freezeConfirmed, setFreezeConfirmed] = useState(false);

  const selectedAccount = eligible.find((a) => a.id === accountId) ?? eligible[0];
  const account = selectedAccount?.id ?? "";
  const tenants = selectedAccount?.tenantIds ?? [];
  const tenant = tenantId && tenants.includes(tenantId) ? tenantId : (tenants[0] ?? "");
  const trimmedPem = recipientPem.trim();
  const valid =
    account !== "" &&
    tenant !== "" &&
    trimmedPem.length >= 64 &&
    trimmedPem.length <= 1900 &&
    freezeConfirmed;
  const errorText = (err: unknown) =>
    err instanceof ApiRequestError &&
    err.status === 409 &&
    err.error.details?.some((d) => d.path === "tenantId" && d.message === "open_job")
      ? t("p04.off.form.busy")
      : t("p04.off.form.failed");

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("p04.off.form.title")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!valid || start.isPending}
            onClick={() =>
              start.mutate(
                {
                  accountId: account,
                  tenantId: tenant,
                  recipientPem: trimmedPem,
                },
                {
                  onSuccess: () => {
                    toast.show({ tone: "success", title: t("p04.off.form.started") });
                    onClose();
                  },
                  onError: (err) => toast.show({ tone: "danger", title: errorText(err) }),
                },
              )
            }
          >
            {t("p04.off.form.submit")}
          </Button>
        </>
      }
    >
      {accounts.isSuccess && eligible.length === 0 ? (
        <EmptyState description={t("p04.off.form.noAccounts")} />
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label={t("p04.off.form.account")}
              value={account}
              options={eligible.map((a) => ({ value: a.id, label: a.name }))}
              onChange={(e) => {
                setAccountId(e.target.value);
                setTenantId("");
              }}
            />
            <Select
              label={t("p04.off.form.tenant")}
              value={tenant}
              options={tenants.map((id) => ({ value: id, label: id }))}
              onChange={(e) => setTenantId(e.target.value)}
            />
          </div>
          <Textarea
            label={t("p04.off.form.pem")}
            description={t("p04.off.form.pemHint")}
            rows={5}
            value={recipientPem}
            onChange={(e) => setRecipientPem(e.target.value)}
          />
          <Checkbox
            label={t("p04.off.form.freezeConfirm")}
            checked={freezeConfirmed}
            onCheckedChange={(v) => setFreezeConfirmed(v === true)}
          />
          {start.isError && (
            <p role="alert" className="text-body-sm text-danger-text">
              {errorText(start.error)}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
