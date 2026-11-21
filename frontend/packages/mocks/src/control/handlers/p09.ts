import { SupportTicketSchema, TicketReplySchema } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { z } from "zod";
import { ApiFailure, failureResponse } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff, visibleTo } from "../context";
import { controlDb } from "../db";
import { CONTROL_API_BASE } from "../route";

const ReplyInput = z.strictObject({
  body: z.string().trim().min(1).max(5000),
  internal: z.boolean(),
});

let replyCounter = 0;
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/** P09: a staff reply or internal note on a ticket. */
export const p09Handlers: HttpHandler[] = [
  http.post(`*${CONTROL_API_BASE}/tickets/:id/replies`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readStaff(request);
      if (!viewer.permissions.has("ctl.ticket.reply")) throw new ApiFailure("forbidden");
      const input = ReplyInput.safeParse(await request.json().catch(() => null));
      if (!input.success) {
        throw new ApiFailure(
          "invalid_request",
          input.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      const ticket = visibleTo(viewer, controlDb.tickets).find((t) => t.id === params["id"]);
      if (!ticket) throw new ApiFailure("not_found");
      if (ticket.status === "closed") throw new ApiFailure("conflict");
      replyCounter += 1;
      const reply = TicketReplySchema.parse({
        id: `rep-new-${replyCounter}`,
        ticketId: ticket.id,
        authorKind: "staff",
        authorStaffId: viewer.staff.id,
        body: input.data.body,
        internal: input.data.internal,
        aiDrafted: false,
        createdAt: nowIso(),
      });
      const status = input.data.internal
        ? ticket.status === "new"
          ? "open"
          : ticket.status
        : "waiting_customer";
      const resolved = status === "resolved";
      const updated = SupportTicketSchema.parse({
        ...ticket,
        status,
        assigneeStaffId: ticket.assigneeStaffId ?? viewer.staff.id,
        resolvedAt: resolved ? ticket.resolvedAt : null,
      });
      controlDb.replies.push(reply);
      controlDb.tickets = controlDb.tickets.map((t) => (t.id === updated.id ? updated : t));
      return HttpResponse.json(reply as JsonBodyType, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
