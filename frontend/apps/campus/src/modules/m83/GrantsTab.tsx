import type { AccessGrant } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useAccessGrants, useGrantHistory, useRevokeGrant } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton, useToast } from "@nexus/ui-core";
import { History, KeyRound } from "lucide-react";
import { useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { grantState, MODE_KEY, MODULE_KEY, timeLeft, when } from "./vaultShared";

export interface GrantsTabProps {
  readonly canRevoke: boolean;
  /** Injected in tests; defaults to now. */
  readonly now?: () => number;
}

function GrantHistory({ grantId }: { readonly grantId: string }) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const history = useGrantHistory(grantId);
  if (history.isPending) return <Skeleton className="h-12 w-full" />;
  const events = history.data?.items ?? [];
  if (events.length === 0)
    return <p className="text-body-sm text-text-muted">{t("m83.grants.noHistory")}</p>;
  return (
    <ul className="space-y-1 text-body-sm" aria-label={t("m83.grants.history")}>
      {events.map((e) => (
        <li key={e.id} className="flex flex-wrap gap-x-3">
          <span className="font-mono tabular-nums text-text-secondary">
            {when(e.occurredAt, locale, timeZone)}
          </span>
          <span className="font-mono">{e.action}</span>
          <span className="text-text-muted">
            {e.targetType}
            {e.targetId ? ` · ${e.targetId}` : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Provider grants with time left, early revoke, and what each grant did (provider-actor audit events). */
export function GrantsTab({ canRevoke, now = Date.now }: GrantsTabProps) {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const online = useOnline();
  const grants = useAccessGrants();
  const revoke = useRevokeGrant();
  const [open, setOpen] = useState<string | null>(null);

  if (grants.isPending) return <Skeleton className="h-40 w-full" />;
  if (grants.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m83.vault.error")}
        action={
          <Button variant="secondary" onClick={() => void grants.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  const nowMs = now();
  const items = [...grants.data.items].sort((a, b) => b.startsAt.localeCompare(a.startsAt));
  if (items.length === 0) {
    return <EmptyState icon={<KeyRound className="h-6 w-6" />} title={t("m83.grants.empty")} />;
  }

  const onRevoke = async (g: AccessGrant) => {
    try {
      await revoke.mutateAsync(g.id);
      toast.show({ tone: "success", title: t("m83.grants.revoked") });
    } catch {
      toast.show({ tone: "danger", title: t("m83.vault.saveFailed") });
    }
  };

  return (
    <div className="space-y-4">
      {items.map((g) => {
        const state = grantState(g, nowMs);
        const left = timeLeft(g.endsAt, nowMs);
        return (
          <Card
            key={g.id}
            title={g.modules.map((m) => (MODULE_KEY[m] ? t(MODULE_KEY[m]) : m)).join(", ")}
            actions={
              <Badge tone={state === "active" ? "warning" : "neutral"}>
                {t(
                  state === "active"
                    ? "m83.grants.active"
                    : state === "revoked"
                      ? "m83.grants.revokedState"
                      : "m83.grants.ended",
                )}
              </Badge>
            }
          >
            <div className="space-y-3 text-body-sm">
              <p>
                {t(MODE_KEY[g.mode])} · {when(g.startsAt, locale, timeZone)} →{" "}
                {when(g.endsAt, locale, timeZone)}
              </p>
              {state === "active" && (
                <p role="timer" className="font-medium text-warning-text">
                  {t("m83.grants.timeLeft", { hours: left.hours, minutes: left.minutes })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {state === "active" && canRevoke && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!online}
                    loading={revoke.isPending}
                    onClick={() => void onRevoke(g)}
                  >
                    {t("m83.grants.revoke")}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  aria-expanded={open === g.id}
                  onClick={() => setOpen(open === g.id ? null : g.id)}
                >
                  <History className="h-4 w-4" aria-hidden="true" />
                  {t("m83.grants.history")}
                </Button>
              </div>
              {open === g.id && <GrantHistory grantId={g.id} />}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
