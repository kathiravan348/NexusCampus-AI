import {
  PAGE_SIZE_MAX,
  SlaPolicySchema,
  SupportTicketSchema,
  TicketReplySchema,
  pageSchema,
  type TicketReply,
  type TicketStatus,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useControlQuery } from "./hooks";
import { useControlServices } from "./provider";

export const TicketPageSchema = pageSchema(SupportTicketSchema);
export const ReplyPageSchema = pageSchema(TicketReplySchema);
export const SlaPolicyPageSchema = pageSchema(SlaPolicySchema);

const ALL = { pageSize: PAGE_SIZE_MAX } as const;

export function useTickets(status: TicketStatus | null = null) {
  return useControlQuery("/tickets", TicketPageSchema, { ...ALL, status });
}

export function useTicket(id: string) {
  return useControlQuery(`/tickets/${encodeURIComponent(id)}`, SupportTicketSchema);
}

export function useTicketReplies(ticketId: string) {
  return useControlQuery("/ticket-replies", ReplyPageSchema, { ...ALL, ticketId });
}

export function useSlaPolicies() {
  return useControlQuery("/sla-policies", SlaPolicyPageSchema, ALL);
}

/** Adds a staff reply or internal note (`ctl.ticket.reply`); the ticket and its thread refetch. */
export function useReplyToTicket() {
  const { client, staffId } = useControlServices();
  const qc = useQueryClient();
  return useMutation<TicketReply, Error, { ticketId: string; body: string; internal: boolean }>({
    mutationFn: ({ ticketId, body, internal }) =>
      client.send(
        "POST",
        `/tickets/${encodeURIComponent(ticketId)}/replies`,
        { body, internal },
        TicketReplySchema,
      ),
    onSuccess: async (reply) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["control", staffId, "/ticket-replies"] }),
        qc.invalidateQueries({ queryKey: ["control", staffId, "/tickets"] }),
        qc.invalidateQueries({
          queryKey: ["control", staffId, `/tickets/${encodeURIComponent(reply.ticketId)}`],
        }),
      ]);
    },
  });
}
