import type { ScopeKind } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import {
  useAssignRole,
  useRemoveAssignment,
  useRoleAssignments,
  useRoles,
  useSetUserStatus,
  useTenant,
} from "@nexus/services";
import { Badge, Button, Input, Modal, Select, useToast } from "@nexus/ui-core";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import {
  pickableKinds,
  SCOPE_KEY,
  scopeLabel,
  scopeOf,
  scopeTargets,
  STATUS_KEY,
  STATUS_TONE,
  today,
} from "./accessShared";
import type { UserRow } from "./UsersTab";

export interface UserDetailProps {
  readonly row: UserRow;
  readonly online: boolean;
  readonly isSelf: boolean;
  readonly onClose: () => void;
}

const ADMIN_PERMISSION = "m02.role.manage";

/** One user: role assignments with scope and dates (add / remove) and suspend / reactivate. */
export function UserDetail({ row, online, isSelf, onClose }: UserDetailProps) {
  const t = useText();
  const toast = useToast();
  const tenant = useTenant();
  const roles = useRoles();
  const assignments = useRoleAssignments();
  const assign = useAssignRole();
  const remove = useRemoveAssignment();
  const setStatus = useSetUserStatus();
  const [roleId, setRoleId] = useState("");
  const [kind, setKind] = useState<ScopeKind | "">("");
  const [targetId, setTargetId] = useState("");
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState("");

  const { user } = row;
  const roleById = new Map(roles.data?.items.map((r) => [r.id, r]));
  const mine = (assignments.data?.items ?? []).filter((a) => a.userId === user.id);
  const adminCount = mine.filter((a) =>
    roleById.get(a.roleId)?.permissions.includes(ADMIN_PERMISSION),
  ).length;
  const role = roleById.get(roleId);
  const kinds = role ? pickableKinds(role.allowedScopeKinds, tenant.data) : [];
  const targets = kind ? scopeTargets(kind, tenant.data) : [];
  const canAssign = Boolean(role && kind && (kind === "own" || targetId) && from && online);

  const fail = () => toast.show({ tone: "danger", title: t("m02.access.saveFailed") });

  const onAssign = async () => {
    if (!role || !kind) return;
    try {
      await assign.mutateAsync({
        userId: user.id,
        roleId: role.id,
        scope: scopeOf(kind, targetId),
        effectiveFrom: from,
        effectiveTo: to || null,
      });
      toast.show({ tone: "success", title: t("m02.detail.assigned") });
      setRoleId("");
      setKind("");
      setTargetId("");
    } catch {
      fail();
    }
  };

  const onStatus = async () => {
    const next = user.status === "suspended" ? "active" : "suspended";
    try {
      await setStatus.mutateAsync({ userId: user.id, status: next });
      toast.show({
        tone: "success",
        title: t(next === "active" ? "m02.detail.reactivated" : "m02.detail.suspended"),
      });
    } catch {
      fail();
    }
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      title={row.name}
      description={user.email}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone={STATUS_TONE[user.status]}>{t(STATUS_KEY[user.status])}</Badge>
          {isSelf ? (
            <p className="text-body-sm text-text-muted">{t("m02.detail.selfHint")}</p>
          ) : (
            (user.status === "active" || user.status === "suspended") && (
              <Button
                variant={user.status === "suspended" ? "primary" : "danger"}
                size="sm"
                loading={setStatus.isPending}
                disabled={!online}
                onClick={() => void onStatus()}
              >
                {t(user.status === "suspended" ? "m02.detail.reactivate" : "m02.detail.suspend")}
              </Button>
            )
          )}
        </div>

        <section className="space-y-3" aria-labelledby="user-assignments">
          <h3 id="user-assignments" className="text-card-title font-semibold text-text-primary">
            {t("m02.detail.assignments")}
          </h3>
          {mine.length === 0 ? (
            <p className="text-body-sm text-text-muted">{t("m02.detail.noAssignments")}</p>
          ) : (
            <ul className="divide-y divide-border-default rounded-lg border border-border-default">
              {mine.map((a) => {
                const r = roleById.get(a.roleId);
                const lastAdmin =
                  isSelf && (r?.permissions.includes(ADMIN_PERMISSION) ?? false) && adminCount <= 1;
                return (
                  <li
                    key={a.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                  >
                    <div className="space-y-0.5">
                      <p className="text-body font-medium text-text-primary">
                        {r?.name ?? a.roleId}
                      </p>
                      <p className="text-body-sm text-text-secondary">
                        {scopeLabel(a.scope, tenant.data, t(SCOPE_KEY[a.scope.kind]))}
                      </p>
                      <p className="font-mono text-number-sm tabular-nums text-text-muted">
                        {a.effectiveFrom} – {a.effectiveTo ?? t("m02.detail.openEnded")}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!online || lastAdmin}
                      title={lastAdmin ? t("m02.detail.lastAdmin") : undefined}
                      aria-label={t("m02.detail.remove", { role: r?.name ?? a.roleId })}
                      onClick={() =>
                        void remove
                          .mutateAsync(a.id)
                          .then(() =>
                            toast.show({ tone: "success", title: t("m02.detail.removed") }),
                          )
                          .catch(fail)
                      }
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="user-add-role">
          <h3 id="user-add-role" className="text-card-title font-semibold text-text-primary">
            {t("m02.detail.addAssignment")}
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label={t("m02.invite.role")}
              placeholder={t("m02.invite.pick")}
              options={(roles.data?.items ?? []).map((r) => ({ value: r.id, label: r.name }))}
              value={roleId}
              onChange={(e) => {
                setRoleId(e.target.value);
                setKind("");
                setTargetId("");
              }}
            />
            <Select
              label={t("m02.invite.scopeKind")}
              placeholder={t("m02.invite.pick")}
              disabled={!role}
              options={kinds.map((k) => ({ value: k, label: t(SCOPE_KEY[k]) }))}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as ScopeKind | "");
                setTargetId("");
              }}
            />
            {kind !== "own" && (
              <Select
                label={t("m02.invite.scopeTarget")}
                placeholder={t("m02.invite.pick")}
                disabled={!kind}
                options={targets}
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
              />
            )}
            <Input
              type="date"
              label={t("m02.detail.effectiveFrom")}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
            <Input
              type="date"
              label={t("m02.detail.effectiveTo")}
              description={t("common.optional")}
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <Button disabled={!canAssign} loading={assign.isPending} onClick={() => void onAssign()}>
            {t("m02.detail.assign")}
          </Button>
        </section>
      </div>
    </Modal>
  );
}
