import { useControlText } from "@nexus/i18n/control";
import { ApiRequestError } from "@nexus/services";
import {
  useStaffCan,
  useStaffDirectory,
  useTicket,
  useTicketReplies,
} from "@nexus/services/control";
import { Badge, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { ArrowLeft, Lock, Sparkles } from "lucide-react";
import { Link, useParams } from "react-router";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { CHANNEL_KEY, PRIORITY_TONE, TICKET_STATUS, priorityLevel } from "./labels";
import { ReplyForm } from "./ReplyForm";

/** One ticket: facts, the thread (internal notes and AI drafts labelled) and the reply form. */
export function TicketDetail() {
  const t = useControlText();
  const fmt = useControlFormat();
  const { ticketId = "" } = useParams();
  const ticket = useTicket(ticketId);
  const replies = useTicketReplies(ticketId);
  const accounts = useAccountNames();
  const staff = useStaffDirectory();
  const can = useStaffCan();

  const back = (
    <Link
      to=".."
      relative="path"
      className="inline-flex items-center gap-1 text-body-sm text-brand-primary-text hover:underline"
    >
      <ArrowLeft className="h-4 w-4 rtl:-scale-x-100" aria-hidden="true" />
      {t("p09.detail.back")}
    </Link>
  );

  if (ticket.isPending) return <Skeleton className="h-64" />;
  if (ticket.isError) {
    const missing = ticket.error instanceof ApiRequestError && ticket.error.status === 404;
    return (
      <div className="space-y-4">
        {back}
        <EmptyState
          tone={missing ? "neutral" : "error"}
          {...(missing ? { description: t("p09.detail.notFound") } : {})}
        />
      </div>
    );
  }

  const tk = ticket.data;
  const status = TICKET_STATUS[tk.status];
  const thread = [...(replies.data?.items ?? [])].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt),
  );

  return (
    <div className="space-y-4">
      {back}
      <div className="space-y-2">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">{tk.subject}</h1>
        <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
          <span className="font-mono">{tk.number}</span>
          <Badge tone={PRIORITY_TONE[tk.priority]}>
            {t("p09.priority", { level: priorityLevel(tk.priority) })}
          </Badge>
          <Badge tone={status.tone}>{t(status.key)}</Badge>
          {tk.breached && <Badge tone="danger">{t("p09.breached")}</Badge>}
          <span>{accounts.get(tk.accountId) ?? tk.accountId}</span>
          <span>{t("p09.detail.channel", { channel: t(CHANNEL_KEY[tk.channel]) })}</span>
          <span>
            {t("p09.col.assignee")}:{" "}
            {tk.assigneeStaffId
              ? (staff.get(tk.assigneeStaffId) ?? tk.assigneeStaffId)
              : t("p09.unassigned")}
          </span>
        </div>
        {tk.summary && <p className="text-body text-text-primary">{tk.summary}</p>}
        {tk.accessRequestId && (
          <p className="text-body-sm text-text-secondary">
            {t("p09.detail.access", { id: tk.accessRequestId })}
          </p>
        )}
      </div>
      <Card headingAs="h2" title={t("p09.thread")}>
        {replies.isPending ? (
          <Skeleton className="h-24" />
        ) : (
          <ol className="space-y-3">
            {thread.map((r) => (
              <li
                key={r.id}
                className={
                  r.internal
                    ? "rounded-md border border-warning bg-warning-subtle p-3"
                    : "rounded-md border border-border-default bg-bg-surface p-3"
                }
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
                  <span className="font-medium text-text-primary">
                    {r.authorKind === "customer"
                      ? t("p09.from.customer")
                      : (staff.get(r.authorStaffId ?? "") ?? r.authorStaffId)}
                  </span>
                  <span>{fmt.date(r.createdAt)}</span>
                  {r.internal && (
                    <Badge tone="warning">
                      <Lock className="me-1 h-3 w-3" aria-hidden="true" />
                      {t("p09.internal")}
                    </Badge>
                  )}
                  {r.aiDrafted && (
                    <Badge tone="info">
                      <Sparkles className="me-1 h-3 w-3" aria-hidden="true" />
                      {t("p09.aiDrafted")}
                    </Badge>
                  )}
                </div>
                <p className="whitespace-pre-wrap text-body text-text-primary">{r.body}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
      {can("ctl.ticket.reply") && tk.status !== "closed" ? (
        <ReplyForm ticketId={tk.id} />
      ) : (
        <p className="text-body-sm text-text-secondary">{t("p09.reply.readOnly")}</p>
      )}
    </div>
  );
}
