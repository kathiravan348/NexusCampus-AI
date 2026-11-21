import { MAX_GRANT_HOURS, type AccessMode, type ModuleId } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useAccounts, useRequestAccess, useTickets } from "@nexus/services/control";
import {
  Button,
  Checkbox,
  EmptyState,
  Input,
  Modal,
  Select,
  Textarea,
  useToast,
} from "@nexus/ui-core";
import { useMemo, useState } from "react";
import { MODULE_NAME_KEY, REQUESTABLE_MODULES } from "./labels";

/** Asks an institution for scoped, time-boxed access; its admin decides in their own app (V-3). */
export function RequestAccessModal({ onClose }: { readonly onClose: () => void }) {
  const t = useControlText();
  const toast = useToast();
  const accounts = useAccounts();
  const tickets = useTickets();
  const send = useRequestAccess();

  const targets = useMemo(
    () =>
      (accounts.data?.items ?? []).flatMap((a) =>
        a.tenantIds.map((tenantId) => ({ value: `${a.id}|${tenantId}`, label: a.name })),
      ),
    [accounts.data],
  );
  const [target, setTarget] = useState("");
  const chosen = target || targets[0]?.value || "";
  const [accountId = "", tenantId = ""] = chosen.split("|");
  const accountTickets = (tickets.data?.items ?? []).filter(
    (tk) => tk.accountId === accountId && tk.status !== "closed",
  );
  const [ticketId, setTicketId] = useState("");
  const [modules, setModules] = useState<ModuleId[]>([]);
  const [mode, setMode] = useState<AccessMode>("read");
  const [hours, setHours] = useState("4");
  const [reason, setReason] = useState("");
  const duration = Number(hours);
  const valid =
    chosen !== "" &&
    modules.length > 0 &&
    Number.isInteger(duration) &&
    duration >= 1 &&
    duration <= MAX_GRANT_HOURS &&
    reason.trim().length > 0;

  return (
    <Modal
      open
      size="lg"
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("p10.form.title")}
      description={t("p10.form.note")}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!valid || send.isPending}
            onClick={() =>
              send.mutate(
                {
                  accountId,
                  tenantId,
                  ticketId: accountTickets.some((tk) => tk.id === ticketId) ? ticketId : null,
                  reason: reason.trim(),
                  modules,
                  mode,
                  durationHours: duration,
                },
                {
                  onSuccess: () => {
                    toast.show({ tone: "success", title: t("p10.form.sent") });
                    onClose();
                  },
                  onError: () => toast.show({ tone: "danger", title: t("p10.form.failed") }),
                },
              )
            }
          >
            {t("p10.form.submit")}
          </Button>
        </>
      }
    >
      {accounts.isSuccess && targets.length === 0 ? (
        <EmptyState description={t("p10.form.noAccounts")} />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              label={t("p10.form.account")}
              value={chosen}
              options={targets}
              onChange={(e) => {
                setTarget(e.target.value);
                setTicketId("");
              }}
            />
            <Select
              label={t("p10.form.ticket")}
              value={ticketId}
              options={[
                { value: "", label: t("p10.form.noTicket") },
                ...accountTickets.map((tk) => ({ value: tk.id, label: tk.number })),
              ]}
              onChange={(e) => setTicketId(e.target.value)}
            />
            <Select
              label={t("p10.form.mode")}
              value={mode}
              options={[
                { value: "read", label: t("p10.mode.read") },
                { value: "edit", label: t("p10.mode.edit") },
              ]}
              onChange={(e) => setMode(e.target.value as AccessMode)}
            />
            <Input
              label={t("p10.form.hours")}
              type="number"
              numeric
              min={1}
              max={MAX_GRANT_HOURS}
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-label text-text-primary">{t("p10.form.modules")}</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REQUESTABLE_MODULES.map((m) => (
                <Checkbox
                  key={m}
                  label={t(MODULE_NAME_KEY[m] ?? "p01.none")}
                  checked={modules.includes(m)}
                  onCheckedChange={(value) =>
                    setModules((current) =>
                      value === true ? [...current, m] : current.filter((x) => x !== m),
                    )
                  }
                />
              ))}
            </div>
          </fieldset>
          <Textarea
            label={t("p10.form.reason")}
            value={reason}
            rows={3}
            maxLength={2000}
            onChange={(e) => setReason(e.target.value)}
          />
        </div>
      )}
    </Modal>
  );
}
