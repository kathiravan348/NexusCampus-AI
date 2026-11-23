import {
  ApiErrorSchema,
  ConfirmMoveStepSchema,
  PortabilityJobSchema,
  PortabilityRequestSchema,
  PortabilityStepNameSchema,
  type PortabilityDirection,
  type PortabilityStepName,
  type StepStatus,
} from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { ApiFailure, failureResponse } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff, visibleTo, type StaffViewer } from "../context";
import { controlDb } from "../db";
import { CONTROL_API_BASE } from "../route";

const MOVE_STEPS = PortabilityStepNameSchema.options;
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

function isSourceCell(direction: PortabilityDirection): boolean {
  return direction === "region_move" || direction === "saas_to_self_hosted";
}

function isDestinationCell(direction: PortabilityDirection): boolean {
  return direction === "region_move" || direction === "self_hosted_to_saas";
}

function isStaffStep(direction: PortabilityDirection, step: PortabilityStepName): boolean {
  switch (step) {
    case "preflight":
      return !isDestinationCell(direction);
    case "export_encrypted":
      return !isSourceCell(direction);
    case "transfer":
      return true;
    case "import":
      return !isDestinationCell(direction);
    case "verify":
      return false;
    case "cutover":
      return true;
    case "shred_source":
      return !isSourceCell(direction);
  }
}

function isValidRsaPem(pem: string): boolean {
  const trimmed = pem.trim();
  const match =
    /^-----BEGIN (?:RSA )?PUBLIC KEY-----\s+([A-Za-z0-9+/=\s]+?)\s+-----END (?:RSA )?PUBLIC KEY-----$/.exec(
      trimmed,
    );
  if (!match?.[1]) return false;
  const body = match[1].replace(/\s+/g, "");
  return body.length >= 64 && /^[A-Za-z0-9+/]+=*$/.test(body);
}

/**
 * In demo mode, cell steps finish at once and stop at the next staff step; `shred_source` on a cell source
 * completes in demo once `cutover` is done.
 */
function advanceDemoCellSteps(
  steps: readonly { readonly name: PortabilityStepName; readonly status: StepStatus }[],
  direction: PortabilityDirection,
): {
  steps: { name: PortabilityStepName; status: StepStatus }[];
  status: StepStatus;
} {
  const out = steps.map((s) => ({ ...s }));
  for (const step of out) {
    if (step.status === "done") continue;
    if (step.status === "failed") break;
    if (isStaffStep(direction, step.name)) {
      step.status = "pending";
      break;
    }
    step.status = "done";
  }
  const allDone = out.every((s) => s.status === "done");
  const anyFailed = out.some((s) => s.status === "failed");
  const anyStarted = out.some((s) => s.status === "done" || s.status === "running");
  const status: StepStatus = allDone
    ? "done"
    : anyFailed
      ? "failed"
      : anyStarted
        ? "running"
        : "pending";
  return { steps: out, status };
}

async function guarded(request: Request, answer: (viewer: StaffViewer) => Promise<Response>) {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readStaff(request);
    if (!viewer.permissions.has("ctl.portability.manage")) throw new ApiFailure("forbidden");
    return await answer(viewer);
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

/** P18 demo writes: start a move, confirm its manual staff steps, and retry a failed move (NEX-142, D61, D63). */
export const p18Handlers: HttpHandler[] = [
  http.post(`*${CONTROL_API_BASE}/portability-jobs`, ({ request }) =>
    guarded(request, async (viewer) => {
      const parsed = PortabilityRequestSchema.safeParse(await request.json().catch(() => null));
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
      const { direction, tenantId, toRegion } = parsed.data;
      if (direction === "region_move" && account.region === toRegion) {
        const err = ApiErrorSchema.parse({
          error: {
            code: "invalid_request",
            message: "A region move requires two different regions.",
          },
        });
        return HttpResponse.json(err as JsonBodyType, { status: 422 });
      }
      if (isSourceCell(direction)) {
        if (account.deliveryModel === "self_hosted") throw new ApiFailure("conflict");
        if (!account.tenantIds.includes(tenantId)) throw new ApiFailure("not_found");
      } else if (account.deliveryModel !== "self_hosted") {
        throw new ApiFailure("conflict");
      }
      const nextNum =
        controlDb.portabilityJobs.filter((j) => j.id.startsWith("mov-new-")).length + 1;
      const initial = MOVE_STEPS.map((name) => ({ name, status: "pending" as StepStatus }));
      const { steps, status } = advanceDemoCellSteps(initial, direction);
      const job = PortabilityJobSchema.parse({
        id: `mov-new-${nextNum}`,
        accountId: account.id,
        tenantId,
        direction,
        fromRegion: account.region,
        toRegion,
        steps,
        status,
        encrypted: true,
        createdAt: nowIso(),
      });
      controlDb.portabilityJobs.unshift(job);
      return HttpResponse.json(job as JsonBodyType, { status: 201 });
    }),
  ),
  http.post(`*${CONTROL_API_BASE}/portability-jobs/:id/confirm`, ({ request, params }) =>
    guarded(request, async (viewer) => {
      const parsed = ConfirmMoveStepSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      const job = visibleTo(viewer, controlDb.portabilityJobs).find((j) => j.id === params["id"]);
      if (!job) throw new ApiFailure("not_found");
      const current = job.steps.find((s) => s.status !== "done");
      if (
        job.status === "failed" ||
        !current ||
        current.status !== "pending" ||
        current.name !== parsed.data.step ||
        !isStaffStep(job.direction, parsed.data.step)
      ) {
        throw new ApiFailure("conflict");
      }

      const body = parsed.data;
      if (body.step === "preflight") {
        if (!body.pem || !isValidRsaPem(body.pem)) {
          throw new ApiFailure("invalid_request", [
            { path: "pem", message: "Destination RSA public key PEM is required." },
          ]);
        }
      } else if (body.step === "export_encrypted") {
        if (!body.fileName || body.rows === undefined) {
          throw new ApiFailure("invalid_request", [
            { path: "fileName", message: "Valid fileName and rows are required." },
          ]);
        }
      } else if (body.step === "import") {
        if (body.rows === undefined) {
          throw new ApiFailure("invalid_request", [
            { path: "rows", message: "Imported row count is required." },
          ]);
        }
        if (body.chainOk === false || body.checkpointOk === false) {
          const failedSteps = job.steps.map((s) =>
            s.name === "import"
              ? { ...s, status: "done" as const }
              : s.name === "verify"
                ? { ...s, status: "failed" as const }
                : s,
          );
          const failedJob = PortabilityJobSchema.parse({
            ...job,
            steps: failedSteps,
            status: "failed",
          });
          controlDb.portabilityJobs = controlDb.portabilityJobs.map((j) =>
            j.id === failedJob.id ? failedJob : j,
          );
          return HttpResponse.json(failedJob as JsonBodyType);
        }
      } else if (body.step === "cutover") {
        controlDb.accounts = controlDb.accounts.map((a) => {
          if (a.id !== job.accountId) return a;
          if (job.direction === "region_move") {
            return { ...a, region: job.toRegion };
          }
          if (job.direction === "saas_to_self_hosted") {
            return {
              ...a,
              region: job.toRegion,
              deliveryModel: "self_hosted",
              tenantIds: a.tenantIds.filter((t) => t !== job.tenantId),
            };
          }
          return {
            ...a,
            region: job.toRegion,
            deliveryModel: "saas_shared",
            tenantIds: a.tenantIds.includes(job.tenantId)
              ? a.tenantIds
              : [...a.tenantIds, job.tenantId],
          };
        });
      }

      const marked = job.steps.map((s) =>
        s.name === body.step ? { ...s, status: "done" as StepStatus } : s,
      );
      const { steps, status } = advanceDemoCellSteps(marked, job.direction);
      const updated = PortabilityJobSchema.parse({
        ...job,
        steps,
        status,
      });
      controlDb.portabilityJobs = controlDb.portabilityJobs.map((j) =>
        j.id === updated.id ? updated : j,
      );
      return HttpResponse.json(updated as JsonBodyType);
    }),
  ),
  http.post(`*${CONTROL_API_BASE}/portability-jobs/:id/retry`, ({ request, params }) =>
    guarded(request, async (viewer) => {
      const job = visibleTo(viewer, controlDb.portabilityJobs).find((j) => j.id === params["id"]);
      if (!job) throw new ApiFailure("not_found");
      if (job.status !== "failed") throw new ApiFailure("conflict");
      // A failed Verify on a self-hosted destination goes back to the staff import step (as the backend).
      const backToImport =
        !isDestinationCell(job.direction) &&
        job.steps.some((s) => s.name === "verify" && s.status === "failed");
      const reset = job.steps.map((s) =>
        s.status === "failed" || (backToImport && s.name === "import")
          ? { ...s, status: "pending" as StepStatus }
          : s,
      );
      const { steps, status } = advanceDemoCellSteps(reset, job.direction);
      const updated = PortabilityJobSchema.parse({
        ...job,
        steps,
        status,
      });
      controlDb.portabilityJobs = controlDb.portabilityJobs.map((j) =>
        j.id === updated.id ? updated : j,
      );
      return HttpResponse.json(updated as JsonBodyType);
    }),
  ),
];
