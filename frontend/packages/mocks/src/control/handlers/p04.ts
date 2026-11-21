import { ProvisioningJobSchema, ProvisioningRequestSchema } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { ApiFailure, failureResponse } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff, visibleTo, type StaffViewer } from "../context";
import { controlDb } from "../db";
import { CONTROL_API_BASE } from "../route";

const STEPS = ["create_tenant", "create_keys", "apply_profile", "seed", "invite_owner"] as const;
let jobCounter = 0;
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

async function guarded(request: Request, answer: (viewer: StaffViewer) => Promise<Response>) {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readStaff(request);
    if (!viewer.permissions.has("ctl.provisioning.manage")) throw new ApiFailure("forbidden");
    return await answer(viewer);
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

/**
 * P04 demo writes. Real provisioning is the control backend talking to the region cell (Stage 2 build step):
 * Control keeps only the tenant id, region, plan and counts (ARCHITECTURE §9).
 */
export const p04Handlers: HttpHandler[] = [
  http.post(`*${CONTROL_API_BASE}/provisioning-jobs`, ({ request }) =>
    guarded(request, async (viewer) => {
      const parsed = ProvisioningRequestSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      const account = visibleTo(viewer, controlDb.accounts).find(
        (a) => a.id === parsed.data.accountId,
      );
      if (!account) throw new ApiFailure("not_found");
      if (account.deliveryModel === "self_hosted") throw new ApiFailure("conflict");
      jobCounter += 1;
      const job = ProvisioningJobSchema.parse({
        id: `prv-new-${jobCounter}`,
        request: parsed.data,
        steps: STEPS.map((name) => ({ name, status: "pending" })),
        status: "pending",
        tenantId: null,
        requestedByStaffId: viewer.staff.id,
        createdAt: nowIso(),
      });
      controlDb.provisioningJobs.unshift(job);
      return HttpResponse.json(job as JsonBodyType, { status: 201 });
    }),
  ),
  http.post(`*${CONTROL_API_BASE}/provisioning-jobs/:id/advance`, ({ request, params }) =>
    guarded(request, async () => {
      const job = controlDb.provisioningJobs.find((j) => j.id === params["id"]);
      if (!job) throw new ApiFailure("not_found");
      const next = job.steps.findIndex((s) => s.status !== "done");
      if (next === -1 || job.status === "failed") throw new ApiFailure("conflict");
      const steps = job.steps.map((s, i) => (i === next ? { ...s, status: "done" as const } : s));
      let tenantId = job.tenantId;
      if (steps[0]?.status === "done" && tenantId === null) {
        tenantId = `ten-new-${job.id.replace(/^prv-/, "")}`;
        const accountId = job.request.accountId;
        controlDb.accounts = controlDb.accounts.map((a) =>
          a.id === accountId && !a.tenantIds.includes(tenantId ?? "")
            ? { ...a, tenantIds: [...a.tenantIds, tenantId ?? ""] }
            : a,
        );
      }
      const allDone = steps.every((s) => s.status === "done");
      const updated = ProvisioningJobSchema.parse({
        ...job,
        steps,
        tenantId,
        status: allDone ? "done" : "running",
      });
      controlDb.provisioningJobs = controlDb.provisioningJobs.map((j) =>
        j.id === updated.id ? updated : j,
      );
      return HttpResponse.json(updated as JsonBodyType);
    }),
  ),
];
