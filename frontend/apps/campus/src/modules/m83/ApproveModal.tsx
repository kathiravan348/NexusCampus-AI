import type { AccessMode, AccessRequest, ModuleId } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { ApiRequestError, useDecideAccessRequest } from "@nexus/services";
import { Button, Checkbox, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { useEffect, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { MODE_KEY, MODULE_KEY, when } from "./vaultShared";

export interface ApproveModalProps {
  readonly request: AccessRequest | null;
  readonly onClose: () => void;
  /** Injected in tests; defaults to now. */
  readonly now?: () => number;
}

/** Approve a provider request with the same or a narrower scope; the owner must acknowledge the end time. */
export function ApproveModal({ request, onClose, now = Date.now }: ApproveModalProps) {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const decide = useDecideAccessRequest();
  const [modules, setModules] = useState<ModuleId[]>([]);
  const [mode, setMode] = useState<AccessMode>("read");
  const [hours, setHours] = useState(1);
  const [ack, setAck] = useState(false);

  useEffect(() => {
    if (!request) return;
    setModules([...request.modules]);
    setMode(request.mode);
    setHours(request.durationHours);
    setAck(false);
  }, [request]);

  if (!request) return null;
  const valid = modules.length > 0 && hours >= 1 && hours <= request.durationHours;
  const endsAt = new Date(now() + Math.max(1, hours) * 3_600_000).toISOString();

  const onApprove = async () => {
    try {
      await decide.mutateAsync({
        id: request.id,
        decision: "approve",
        scope: { modules, mode, durationHours: hours },
      });
      toast.show({ tone: "success", title: t("m83.approve.done") });
      onClose();
    } catch (e) {
      const widened = e instanceof ApiRequestError && e.error.code === "invalid_request";
      toast.show({
        tone: "danger",
        title: t(widened ? "m83.approve.widened" : "m83.vault.saveFailed"),
      });
    }
  };

  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("m83.approve.title", { staff: request.staffDisplayName })}
      description={request.reason}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!valid || !ack}
            loading={decide.isPending}
            onClick={() => void onApprove()}
          >
            {t("m83.approve.confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-body font-medium">{t("m83.approve.modules")}</legend>
          {request.modules.map((m) => (
            <Checkbox
              key={m}
              label={MODULE_KEY[m] ? t(MODULE_KEY[m]) : m}
              checked={modules.includes(m)}
              onCheckedChange={(on) =>
                setModules((prev) => (on === true ? [...prev, m] : prev.filter((x) => x !== m)))
              }
            />
          ))}
        </fieldset>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("m83.approve.mode")}
            options={(request.mode === "edit" ? ["read", "edit"] : ["read"]).map((m) => ({
              value: m,
              label: t(MODE_KEY[m as AccessMode]),
            }))}
            value={mode}
            onChange={(e) => setMode(e.target.value as AccessMode)}
          />
          <Input
            type="number"
            numeric
            min={1}
            max={request.durationHours}
            label={t("m83.approve.hours")}
            description={t("m83.approve.hoursHint", { max: request.durationHours })}
            value={hours}
            onChange={(e) => setHours(Number(e.target.value))}
          />
        </div>
        <Checkbox
          label={t("m83.approve.ack", { end: when(endsAt, locale, timeZone) })}
          checked={ack}
          onCheckedChange={(v) => setAck(v === true)}
        />
      </div>
    </Modal>
  );
}
