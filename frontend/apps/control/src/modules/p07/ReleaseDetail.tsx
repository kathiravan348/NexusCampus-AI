import type { Release, Rollout } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useDeployments, useStartRollout } from "@nexus/services/control";
import { Badge, Button, Card, EmptyState, useToast } from "@nexus/ui-core";
import { useMemo } from "react";
import { ROLLOUT_STATUS } from "./labels";

/** A release's migration notes and its rollout rings (0 our own cell first → 3 everyone). */
export function ReleaseDetail({
  release,
  rollouts,
  canManage,
}: {
  readonly release: Release;
  readonly rollouts: readonly Rollout[];
  readonly canManage: boolean;
}) {
  const t = useControlText();
  const toast = useToast();
  const start = useStartRollout();
  const deployments = useDeployments();
  const names = useMemo(
    () => new Map((deployments.data?.items ?? []).map((d) => [d.id, d.name])),
    [deployments.data],
  );
  const rings = [...rollouts].sort((a, b) => a.ring - b.ring);
  const nextRing = rings.find((r) => r.status === "pending");
  const ready =
    release.status === "published" &&
    nextRing !== undefined &&
    rings.filter((r) => r.ring < nextRing.ring).every((r) => r.status === "done");

  return (
    <Card headingAs="h2" title={t("p07.detail.title", { version: release.version })}>
      <div className="space-y-4">
        <p className="text-body-sm text-text-secondary">
          {t("p07.detail.minUpgrade", { version: release.minUpgradeFrom })}
        </p>
        <section className="space-y-1">
          <h3 className="text-body font-medium text-text-primary">{t("p07.detail.notes")}</h3>
          <p className="whitespace-pre-wrap text-body text-text-primary">
            {release.migrationNotes}
          </p>
        </section>
        <section className="space-y-2">
          <h3 className="text-body font-medium text-text-primary">{t("p07.detail.rollout")}</h3>
          {rings.length === 0 ? (
            <EmptyState description={t("p07.detail.noRollout")} />
          ) : (
            <ol className="space-y-2">
              {rings.map((r) => {
                const s = ROLLOUT_STATUS[r.status];
                return (
                  <li
                    key={r.id}
                    className="flex flex-wrap items-center gap-3 rounded-md border border-border-default p-3"
                  >
                    <span className="font-medium text-text-primary">
                      {t("p07.ring", { ring: r.ring })}
                    </span>
                    <Badge tone={s.tone}>{t(s.key)}</Badge>
                    <span className="min-w-0 flex-1 text-body-sm text-text-secondary">
                      {t("p07.ringTargets", {
                        count: r.deploymentIds.length,
                        names: r.deploymentIds.map((id) => names.get(id) ?? id).join(", "),
                      })}
                    </span>
                    {canManage && ready && nextRing?.id === r.id && (
                      <Button
                        size="sm"
                        aria-label={t("p07.startLabel", { ring: r.ring })}
                        disabled={start.isPending}
                        onClick={() =>
                          start.mutate(r.id, {
                            onSuccess: () =>
                              toast.show({ tone: "success", title: t("p07.started") }),
                            onError: () =>
                              toast.show({ tone: "danger", title: t("p07.startFailed") }),
                          })
                        }
                      >
                        {t("p07.start")}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </Card>
  );
}
