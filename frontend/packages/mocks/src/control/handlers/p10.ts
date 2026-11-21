import {
  AccessRequestSchema,
  BrokerRequestSchema,
  MAX_GRANT_HOURS,
  ModuleIdSchema,
  type AccessRequest,
  type BrokerRequest,
} from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { z } from "zod";
import { ApiFailure, failureResponse } from "../../context";
import { mockDb } from "../../db";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff, visibleTo } from "../context";
import { controlDb } from "../db";
import { CONTROL_API_BASE } from "../route";

const NewRequest = z.strictObject({
  accountId: z.string().min(1),
  tenantId: z.string().min(1),
  ticketId: z.string().min(1).nullable(),
  reason: z.string().trim().min(1).max(2000),
  modules: z.array(ModuleIdSchema).min(1),
  mode: z.enum(["read", "edit"]),
  durationHours: z.int().min(1).max(MAX_GRANT_HOURS),
});

let requestCounter = 0;
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/**
 * Our requests as the institution sees them: the decision is made in the institution's app (M83), never here
 * (V-3, D22). In the demo both live in one browser, so the Control row reads the M83 row's decision.
 */
export function syncedBrokerRequests(): BrokerRequest[] {
  const m83 = new Map((mockDb.accessRequests as AccessRequest[]).map((r) => [r.id, r]));
  return controlDb.brokerRequests.map((r) => {
    const own = m83.get(r.id);
    if (!own || own.status === "pending" || r.status !== "pending") return r;
    return BrokerRequestSchema.parse({
      ...r,
      status: own.status === "expired" ? "ended" : own.status,
      decidedAt: own.decidedAt,
    });
  });
}

/** P10: ask an institution for time-boxed access. The institution approves or denies it in M83. */
export const p10Handlers: HttpHandler[] = [
  http.post(`*${CONTROL_API_BASE}/broker-requests`, async ({ request }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readStaff(request);
      if (!viewer.permissions.has("ctl.broker.request")) throw new ApiFailure("forbidden");
      const input = NewRequest.safeParse(await request.json().catch(() => null));
      if (!input.success) {
        throw new ApiFailure(
          "invalid_request",
          input.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      const data = input.data;
      if (data.modules.includes("M83")) {
        throw new ApiFailure("invalid_request", [
          { path: "modules", message: "The data vault itself is never in scope." },
        ]);
      }
      const account = visibleTo(viewer, controlDb.accounts).find((a) => a.id === data.accountId);
      if (!account || !account.tenantIds.includes(data.tenantId)) throw new ApiFailure("not_found");
      requestCounter += 1;
      const id = `acr-new-${requestCounter}`;
      const requestedAt = nowIso();
      const broker = BrokerRequestSchema.parse({
        id,
        ...data,
        requestedByStaffId: viewer.staff.id,
        status: "pending",
        requestedAt,
        decidedAt: null,
      });
      const m83 = AccessRequestSchema.parse({
        id,
        tenantId: data.tenantId,
        staffRef: viewer.staff.id,
        staffDisplayName: `${viewer.staff.displayName} (Nexus Support)`,
        reason: data.reason,
        modules: data.modules,
        mode: data.mode,
        durationHours: data.durationHours,
        status: "pending",
        requestedAt,
        decidedAt: null,
        decidedBy: null,
      });
      controlDb.brokerRequests.unshift(broker);
      (mockDb.accessRequests as AccessRequest[]).unshift(m83);
      return HttpResponse.json(broker as JsonBodyType, { status: 201 });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  }),
];
