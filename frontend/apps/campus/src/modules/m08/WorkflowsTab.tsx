import type { WorkflowSubject } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import { useNumberingFormats, useWorkflows } from "@nexus/services";
import { Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";

const WORKFLOW_SUBJECT_KEYS = {
  application: "m08.subject.application",
  leave_request: "m08.subject.leaveRequest",
  document_request: "m08.subject.documentRequest",
  fee_concession: "m08.subject.feeConcession",
  record_change: "m08.subject.recordChange",
} satisfies Record<WorkflowSubject, MessageKey>;

export function WorkflowsTab() {
  const t = useText();
  const workflows = useWorkflows();
  const formats = useNumberingFormats();
  const retry = (refetch: () => Promise<unknown>) => (
    <EmptyState
      tone="error"
      title={t("common.error")}
      action={
        <Button variant="secondary" onClick={() => void refetch()}>
          {t("common.retry")}
        </Button>
      }
    />
  );
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="font-semibold text-text-primary">{t("m08.workflows.heading")}</h2>
        {workflows.data ? (
          workflows.data.items.length === 0 ? (
            <EmptyState title={t("m08.workflows.empty")} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {workflows.data.items.map((workflow) => (
                <li key={workflow.id} className="min-w-0">
                  <Card title={<span className="break-words">{workflow.name}</span>}>
                    <p>{t(WORKFLOW_SUBJECT_KEYS[workflow.subject])}</p>
                    <p>{t("m08.workflows.steps", { count: workflow.steps.length })}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )
        ) : workflows.isError ? (
          retry(workflows.refetch)
        ) : (
          <Skeleton className="h-24 w-full" />
        )}
      </section>
      <section className="space-y-3">
        <h2 className="font-semibold text-text-primary">{t("m08.numbering.heading")}</h2>
        {formats.data ? (
          formats.data.items.length === 0 ? (
            <EmptyState title={t("m08.numbering.empty")} />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {formats.data.items.map((format) => (
                <li key={format.id} className="min-w-0">
                  <Card title={t(`m08.subject.${format.subject}`)}>
                    <bdi className="break-all font-mono" dir="ltr">
                      {format.pattern}
                    </bdi>
                  </Card>
                </li>
              ))}
            </ul>
          )
        ) : formats.isError ? (
          retry(formats.refetch)
        ) : (
          <Skeleton className="h-24 w-full" />
        )}
      </section>
    </div>
  );
}
