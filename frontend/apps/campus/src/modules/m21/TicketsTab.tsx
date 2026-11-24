import type { RevaluationRequestStatus } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import {
  useExamTicketNames,
  useHallTickets,
  useLearners,
  useRevaluationRequests,
} from "@nexus/services";
import { Badge, Card } from "@nexus/ui-core";
import { useLearnerNames } from "../m18/InvoicesTab";
import { readState, useExamFormats } from "./ScheduleTab";

const statusKeys: Record<RevaluationRequestStatus, MessageKey> = {
  requested: "m21.status.requested",
  in_review: "m21.status.inReview",
  changed: "m21.status.changed",
  unchanged: "m21.status.unchanged",
  rejected: "m21.status.rejected",
};

export function TicketsTab({ staff }: { readonly staff: boolean }) {
  const t = useText();
  const tickets = useHallTickets();
  const requests = useRevaluationRequests();
  const learnerNames = useLearnerNames();
  const learners = useLearners();
  const { examNames, paperNames } = useExamTicketNames(staff, Boolean(requests.data?.items.length));
  const showNames = staff || (learners.data?.items.length ?? 0) > 1;
  const { issued, number } = useExamFormats();
  const ticketState = readState(tickets);
  const requestState = readState(requests);
  return (
    <div className="min-w-0 space-y-4 break-words">
      <Card title={t("m21.tickets.heading")}>
        {ticketState || !tickets.data?.items.length ? (
          <p role="status">{t(ticketState ?? "m21.tickets.empty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {tickets.data.items.map((ticket) => (
              <li
                key={ticket.id}
                className="min-w-0 space-y-1 rounded-md border border-border-default p-3"
              >
                <h3 className="font-semibold">
                  {examNames.get(ticket.examId) ?? t("m21.tickets.exam")}
                </h3>
                {showNames && learnerNames.has(ticket.learnerId) && (
                  <p>{learnerNames.get(ticket.learnerId)}</p>
                )}
                <p>{t("m21.tickets.number", { number: ticket.ticketNumber })}</p>
                <p>{t("m21.tickets.issued", { date: issued(ticket.issuedAt) })}</p>
                {ticket.revoked && <Badge tone="danger">{t("m21.tickets.revoked")}</Badge>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card title={t("m21.revaluation.heading")}>
        {requestState || !requests.data?.items.length ? (
          <p role="status">{t(requestState ?? "m21.revaluation.empty")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {requests.data.items.map((request) => (
              <li
                key={request.id}
                className="min-w-0 space-y-1 rounded-md border border-border-default p-3"
              >
                <h3 className="font-semibold">
                  {paperNames.get(request.examPaperId) ?? t("m21.revaluation.paper")}
                </h3>
                {showNames && learnerNames.has(request.learnerId) && (
                  <p>{learnerNames.get(request.learnerId)}</p>
                )}
                <p>{t("m21.revaluation.old", { marks: number(request.oldMarks) })}</p>
                {request.newMarks !== null && (
                  <p>{t("m21.revaluation.new", { marks: number(request.newMarks) })}</p>
                )}
                <Badge tone="info">{t(statusKeys[request.status])}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
