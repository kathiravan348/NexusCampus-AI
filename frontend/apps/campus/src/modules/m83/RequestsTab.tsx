import type { AccessRequest } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useAccessRequests, useDecideAccessRequest } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton, Textarea, useToast } from "@nexus/ui-core";
import { Inbox } from "lucide-react";
import { useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { ApproveModal } from "./ApproveModal";
import { MODE_KEY, MODULE_KEY, REQUEST_STATUS_KEY, REQUEST_TONE, when } from "./vaultShared";

export interface RequestsTabProps {
  readonly canDecide: boolean;
  readonly now?: () => number;
}

/** Provider access requests, pending first: approve (same or narrower scope) or deny with a reason. */
export function RequestsTab({ canDecide, now }: RequestsTabProps) {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const online = useOnline();
  const requests = useAccessRequests();
  const decide = useDecideAccessRequest();
  const [approving, setApproving] = useState<AccessRequest | null>(null);
  const [denyingId, setDenyingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  if (requests.isPending) return <Skeleton className="h-40 w-full" />;
  if (requests.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m83.vault.error")}
        action={
          <Button variant="secondary" onClick={() => void requests.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  const items = [...requests.data.items].sort(
    (a, b) =>
      Number(b.status === "pending") - Number(a.status === "pending") ||
      b.requestedAt.localeCompare(a.requestedAt),
  );
  if (items.length === 0) {
    return <EmptyState icon={<Inbox className="h-6 w-6" />} title={t("m83.requests.empty")} />;
  }

  const onDeny = async (id: string) => {
    try {
      await decide.mutateAsync({ id, decision: "deny", reason: reason.trim() });
      toast.show({ tone: "success", title: t("m83.requests.denied") });
      setDenyingId(null);
      setReason("");
    } catch {
      toast.show({ tone: "danger", title: t("m83.vault.saveFailed") });
    }
  };

  return (
    <div className="space-y-4">
      {items.map((r) => (
        <Card
          key={r.id}
          title={r.staffDisplayName}
          actions={<Badge tone={REQUEST_TONE[r.status]}>{t(REQUEST_STATUS_KEY[r.status])}</Badge>}
        >
          <div className="space-y-3 text-body-sm">
            <p className="text-body text-text-primary">{r.reason}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              <dt className="text-text-muted">{t("m83.requests.modules")}</dt>
              <dd>{r.modules.map((m) => (MODULE_KEY[m] ? t(MODULE_KEY[m]) : m)).join(", ")}</dd>
              <dt className="text-text-muted">{t("m83.requests.mode")}</dt>
              <dd>{t(MODE_KEY[r.mode])}</dd>
              <dt className="text-text-muted">{t("m83.requests.duration")}</dt>
              <dd>{t("m83.requests.hours", { count: r.durationHours })}</dd>
              <dt className="text-text-muted">{t("m83.requests.requested")}</dt>
              <dd className="font-mono tabular-nums">{when(r.requestedAt, locale, timeZone)}</dd>
            </dl>
            {r.status === "pending" && canDecide && denyingId !== r.id && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!online} onClick={() => setApproving(r)}>
                  {t("m83.requests.approve")}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!online}
                  onClick={() => setDenyingId(r.id)}
                >
                  {t("m83.requests.deny")}
                </Button>
              </div>
            )}
            {denyingId === r.id && (
              <div className="space-y-2">
                <Textarea
                  label={t("m83.requests.denyReason")}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!reason.trim()}
                    loading={decide.isPending}
                    onClick={() => void onDeny(r.id)}
                  >
                    {t("m83.requests.confirmDeny")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDenyingId(null)}>
                    {t("common.cancel")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ))}
      <ApproveModal
        request={approving}
        onClose={() => setApproving(null)}
        {...(now ? { now } : {})}
      />
    </div>
  );
}
