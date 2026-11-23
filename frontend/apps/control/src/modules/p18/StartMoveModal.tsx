import {
  PortabilityDirectionSchema,
  RegionSchema,
  type PortabilityDirection,
  type Region,
} from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { ApiRequestError } from "@nexus/services";
import { useAccounts, useStartMove } from "@nexus/services/control";
import { Button, EmptyState, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useMemo, useState } from "react";
import { DIRECTION_KEY } from "./labels";

/** Starts a 7-step portability move (region move, SaaS → self-hosted, or self-hosted → SaaS; D61). */
export function StartMoveModal({ onClose }: { readonly onClose: () => void }) {
  const t = useControlText();
  const toast = useToast();
  const accounts = useAccounts();
  const start = useStartMove();

  const [direction, setDirection] = useState<PortabilityDirection>("region_move");
  const [accountId, setAccountId] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [toRegion, setToRegion] = useState<Region | "">("");

  const eligible = useMemo(() => {
    const all = accounts.data?.items ?? [];
    if (direction === "self_hosted_to_saas") {
      return all.filter((a) => a.deliveryModel === "self_hosted");
    }
    return all.filter((a) => a.deliveryModel !== "self_hosted" && a.tenantIds.length > 0);
  }, [accounts.data, direction]);

  const selectedAccount = eligible.find((a) => a.id === accountId) ?? eligible[0];
  const account = selectedAccount?.id ?? "";
  const tenants = selectedAccount?.tenantIds ?? [];
  const resolvedTenant =
    tenants.length > 0
      ? tenantId && tenants.includes(tenantId)
        ? tenantId
        : (tenants[0] ?? "")
      : tenantId.trim();

  const defaultRegion: Region = useMemo(() => {
    const srcRegion = selectedAccount?.region ?? "in";
    if (direction === "region_move") {
      return (RegionSchema.options.find((r) => r !== srcRegion) ?? "eu") as Region;
    }
    return srcRegion;
  }, [direction, selectedAccount?.region]);

  const destinationRegion: Region = toRegion || defaultRegion;
  const valid = account !== "" && resolvedTenant !== "";
  const errorText = (err: unknown) =>
    err instanceof ApiRequestError &&
    err.status === 409 &&
    err.error.details?.some((d) => d.path === "tenantId" && d.message === "open_job")
      ? t("p18.form.busy")
      : t("p18.form.failed");

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("p18.form.title")}
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
                  tenantId: resolvedTenant,
                  direction,
                  toRegion: destinationRegion,
                },
                {
                  onSuccess: () => {
                    toast.show({ tone: "success", title: t("p18.form.started") });
                    onClose();
                  },
                  onError: (err) => toast.show({ tone: "danger", title: errorText(err) }),
                },
              )
            }
          >
            {t("p18.form.submit")}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="rounded-md bg-warning-subtle p-3 text-body-sm text-warning-text">
          {t("p18.form.frozenNotice")}
        </p>
        <Select
          label={t("p18.form.direction")}
          value={direction}
          options={PortabilityDirectionSchema.options.map((d) => ({
            value: d,
            label: t(DIRECTION_KEY[d]),
          }))}
          onChange={(e) => {
            setDirection(e.target.value as PortabilityDirection);
            setAccountId("");
            setTenantId("");
            setToRegion("");
          }}
        />
        {accounts.isSuccess && eligible.length === 0 ? (
          <EmptyState description={t("p18.form.noAccounts")} />
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label={t("p18.form.account")}
              value={account}
              options={eligible.map((a) => ({ value: a.id, label: a.name }))}
              onChange={(e) => {
                setAccountId(e.target.value);
                setTenantId("");
                setToRegion("");
              }}
            />
            {tenants.length > 0 ? (
              <Select
                label={t("p18.form.tenant")}
                value={resolvedTenant}
                options={tenants.map((id) => ({ value: id, label: id }))}
                onChange={(e) => setTenantId(e.target.value)}
              />
            ) : (
              <Input
                label={t("p18.form.tenant")}
                value={tenantId}
                onChange={(e) => setTenantId(e.target.value)}
              />
            )}
            <Select
              label={t("p18.form.toRegion")}
              value={destinationRegion}
              options={RegionSchema.options.map((r) => ({ value: r, label: t(`m01.region.${r}`) }))}
              onChange={(e) => setToRegion(e.target.value as Region)}
            />
          </div>
        )}
        {start.isError && (
          <p role="alert" className="text-body-sm text-danger-text">
            {errorText(start.error)}
          </p>
        )}
      </div>
    </Modal>
  );
}
