import type { ImplementationProject } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useProjects, useStaffDirectory } from "@nexus/services/control";
import { Badge, Card, EmptyState, Select, Skeleton } from "@nexus/ui-core";
import { CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { KIND_KEY, PROJECT_STATUS } from "./labels";

type Status = ImplementationProject["status"];
const STATUSES = Object.keys(PROJECT_STATUS) as Status[];

/** P15 Implementation projects (read-only): kind, status, lead, go-live date and the checklist. */
export default function ProjectsPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const [status, setStatus] = useState<Status | "">("");
  const projects = useProjects(status || null);
  const accounts = useAccountNames();
  const staff = useStaffDirectory();
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p15.nav")}</h1>
      <Select
        label={t("p15.filter")}
        containerClassName="max-w-xs"
        value={status}
        options={[
          { value: "", label: t("p15.all") },
          ...STATUSES.map((s) => ({ value: s, label: t(PROJECT_STATUS[s].key) })),
        ]}
        onChange={(e) => setStatus(e.target.value as Status | "")}
      />
      {projects.isPending ? (
        <Skeleton className="h-48" />
      ) : projects.isError ? (
        <EmptyState tone="error" />
      ) : projects.data.items.length === 0 ? (
        <EmptyState description={t("p15.empty")} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {projects.data.items.map((p) => {
            const done = p.tasks.filter((task) => task.done).length;
            return (
              <li key={p.id}>
                <Card
                  headingAs="h2"
                  title={accounts.get(p.accountId) ?? p.accountId}
                  actions={
                    <Badge tone={PROJECT_STATUS[p.status].tone}>
                      {t(PROJECT_STATUS[p.status].key)}
                    </Badge>
                  }
                >
                  <div className="space-y-3">
                    <p className="text-body-sm text-text-secondary">
                      {t("p15.meta", {
                        kind: t(KIND_KEY[p.kind]),
                        lead: staff.get(p.leadStaffId) ?? p.leadStaffId,
                      })}
                    </p>
                    <p className="text-body-sm">
                      {p.goLiveDate
                        ? t("p15.goLive", { date: fmt.date(p.goLiveDate) })
                        : t("p15.noGoLive")}
                    </p>
                    {p.planAiDrafted && (
                      <p>
                        <Badge tone="info">{t("p15.aiDraft")}</Badge>
                      </p>
                    )}
                    <section className="space-y-1">
                      <h3 className="text-body font-medium text-text-primary">
                        {t("p15.progress", { done, total: p.tasks.length })}
                      </h3>
                      <ul className="space-y-1">
                        {p.tasks.map((task) => {
                          const overdue =
                            !task.done && task.dueDate !== null && task.dueDate < today;
                          return (
                            <li key={task.title} className="flex items-start gap-2 text-body-sm">
                              {task.done ? (
                                <CheckCircle2
                                  className="mt-0.5 h-4 w-4 shrink-0 text-success"
                                  aria-label={t("p15.taskDone")}
                                />
                              ) : (
                                <Circle
                                  className="mt-0.5 h-4 w-4 shrink-0 text-text-secondary"
                                  aria-label={t("p15.taskOpen")}
                                />
                              )}
                              <span className="flex flex-wrap items-center gap-2">
                                <span>{task.title}</span>
                                {task.dueDate && (
                                  <span className="text-text-secondary">
                                    {t("p15.due", { date: fmt.date(task.dueDate) })}
                                  </span>
                                )}
                                {overdue && <Badge tone="danger">{t("p15.overdue")}</Badge>}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
