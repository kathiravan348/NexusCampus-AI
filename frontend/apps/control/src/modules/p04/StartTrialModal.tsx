import {
  InstitutionTypeSchema,
  RegionSchema,
  type InstitutionType,
  type Region,
} from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useAccounts, useCatalogue, useStartTrial } from "@nexus/services/control";
import { Button, EmptyState, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useMemo, useState } from "react";

/** Starts a trial tenant in a region cell for a lead or trial account (`ctl.provisioning.manage`). */
export function StartTrialModal({ onClose }: { readonly onClose: () => void }) {
  const t = useControlText();
  const toast = useToast();
  const accounts = useAccounts();
  const catalogue = useCatalogue();
  const start = useStartTrial();

  const eligible = useMemo(
    () =>
      (accounts.data?.items ?? []).filter(
        (a) => (a.stage === "lead" || a.stage === "trial") && a.deliveryModel !== "self_hosted",
      ),
    [accounts.data],
  );
  const plans = useMemo(
    () => (catalogue.data?.items ?? []).filter((i) => i.kind === "saas_plan" && i.active),
    [catalogue.data],
  );

  const [accountId, setAccountId] = useState("");
  const [region, setRegion] = useState<Region>("in");
  const [type, setType] = useState<InstitutionType>("tp");
  const [planCode, setPlanCode] = useState("");
  const [model, setModel] = useState<"saas_shared" | "saas_dedicated">("saas_shared");
  const [days, setDays] = useState("30");

  const account = accountId || eligible[0]?.id || "";
  const plan = planCode || plans[0]?.code || "";
  const trialDays = Number(days);
  const valid =
    account !== "" &&
    plan !== "" &&
    Number.isInteger(trialDays) &&
    trialDays >= 1 &&
    trialDays <= 60;

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("p04.form.title")}
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
                  region,
                  institutionType: type,
                  planCode: plan,
                  trialDays,
                  deliveryModel: model,
                },
                {
                  onSuccess: () => {
                    toast.show({ tone: "success", title: t("p04.form.started") });
                    onClose();
                  },
                  onError: () => toast.show({ tone: "danger", title: t("p04.form.failed") }),
                },
              )
            }
          >
            {t("p04.form.submit")}
          </Button>
        </>
      }
    >
      {accounts.isSuccess && eligible.length === 0 ? (
        <EmptyState description={t("p04.form.noAccounts")} />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Select
            label={t("p04.form.account")}
            value={account}
            options={eligible.map((a) => ({ value: a.id, label: a.name }))}
            onChange={(e) => setAccountId(e.target.value)}
          />
          <Select
            label={t("p04.form.region")}
            value={region}
            options={RegionSchema.options.map((r) => ({ value: r, label: t(`m01.region.${r}`) }))}
            onChange={(e) => setRegion(e.target.value as Region)}
          />
          <Select
            label={t("p04.form.type")}
            value={type}
            options={InstitutionTypeSchema.options.map((x) => ({
              value: x,
              label: t(`m01.type.${x}`),
            }))}
            onChange={(e) => setType(e.target.value as InstitutionType)}
          />
          <Select
            label={t("p04.form.plan")}
            value={plan}
            options={plans.map((p) => ({ value: p.code, label: p.name }))}
            onChange={(e) => setPlanCode(e.target.value)}
          />
          <Select
            label={t("p04.form.model")}
            value={model}
            options={[
              { value: "saas_shared", label: t("p01.model.saasShared") },
              { value: "saas_dedicated", label: t("p01.model.saasDedicated") },
            ]}
            onChange={(e) => setModel(e.target.value as "saas_shared" | "saas_dedicated")}
          />
          <Input
            label={t("p04.form.trialDays")}
            type="number"
            min={1}
            max={60}
            numeric
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
