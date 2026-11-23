import {
  OffboardingJobSchema,
  OffboardingRequestSchema,
  ProvisioningJobSchema,
  ProvisioningRequestSchema,
  ShredCertificateSchema,
} from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { ApiFailure, failureResponse } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff, visibleTo, type StaffViewer } from "../context";
import { controlDb } from "../db";
import { MOCK_SIGNATURE } from "../fixtures";
import { CONTROL_API_BASE } from "../route";

const STEPS = ["create_tenant", "create_keys", "apply_profile", "seed", "invite_owner"] as const;
const OFFBOARDING_STEPS = [
  "freeze_writes",
  "export_ready",
  "export_downloaded",
  "keys_destroyed",
  "certificate_issued",
] as const;

let jobCounter = 0;
let offCounter = 0;
const firstApproverByJob = new Map<string, string>();
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

/** Marks the "another offboarding or move is open" 409, as the backend (D66). */
const OPEN_JOB = [{ path: "tenantId", message: "open_job" }];

function hasOpenTenantJob(tenantId: string, exceptOffboardingId?: string): boolean {
  const open = (s: string) => s === "pending" || s === "running";
  return (
    controlDb.offboardingJobs.some(
      (j) => j.tenantId === tenantId && j.id !== exceptOffboardingId && open(j.status),
    ) || controlDb.portabilityJobs.some((j) => j.tenantId === tenantId && open(j.status))
  );
}

function isValidRsaPem(pem: string): boolean {
  const trimmed = pem.trim();
  const match =
    /^-----BEGIN (?:RSA )?PUBLIC KEY-----\s+([A-Za-z0-9+/=\s]+?)\s+-----END (?:RSA )?PUBLIC KEY-----$/.exec(
      trimmed,
    );
  if (!match?.[1]) return false;
  const body = match[1].replace(/\s+/g, "");
  if (body.length < 64 || !/^[A-Za-z0-9+/]+=*$/.test(body)) return false;
  // Mirror backend RSA >= 3072 check: reject keys shorter than 3072-bit SPKI when a real DER key is supplied.
  if (body.startsWith("MIIB") && body.length > 350 && body.length < 500) return false;
  return true;
}

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
 * P04 demo writes: provisioning create / advance / retry and offboarding create / confirm-download /
 * four-eyes approve-destroy / retry (NEX-075, NEX-141, D61, D63).
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
  http.post(`*${CONTROL_API_BASE}/provisioning-jobs/:id/retry`, ({ request, params }) =>
    guarded(request, async (viewer) => {
      const job = controlDb.provisioningJobs.find((j) => j.id === params["id"]);
      if (!job) throw new ApiFailure("not_found");
      const account = visibleTo(viewer, controlDb.accounts).find(
        (a) => a.id === job.request.accountId,
      );
      if (!account) throw new ApiFailure("not_found");
      if (job.status !== "failed") throw new ApiFailure("conflict");
      let firstFailedSeen = false;
      const steps = job.steps.map((s) => {
        if (s.status === "done") return s;
        if (!firstFailedSeen) {
          firstFailedSeen = true;
          return { ...s, status: "running" as const };
        }
        return { ...s, status: "pending" as const };
      });
      const updated = ProvisioningJobSchema.parse({
        ...job,
        steps,
        status: "running",
      });
      controlDb.provisioningJobs = controlDb.provisioningJobs.map((j) =>
        j.id === updated.id ? updated : j,
      );
      return HttpResponse.json(updated as JsonBodyType);
    }),
  ),
  http.post(`*${CONTROL_API_BASE}/offboarding-jobs`, ({ request }) =>
    guarded(request, async (viewer) => {
      const parsed = OffboardingRequestSchema.safeParse(await request.json().catch(() => null));
      if (!parsed.success) {
        throw new ApiFailure(
          "invalid_request",
          parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        );
      }
      if (!isValidRsaPem(parsed.data.recipientPem)) {
        throw new ApiFailure("invalid_request", [
          { path: "recipientPem", message: "Must be a valid RSA public key PEM (>= 3072 bits)." },
        ]);
      }
      const account = visibleTo(viewer, controlDb.accounts).find(
        (a) => a.id === parsed.data.accountId,
      );
      if (!account || !account.tenantIds.includes(parsed.data.tenantId)) {
        throw new ApiFailure("not_found");
      }
      if (account.deliveryModel === "self_hosted") throw new ApiFailure("conflict");
      if (hasOpenTenantJob(parsed.data.tenantId)) throw new ApiFailure("conflict", OPEN_JOB);
      offCounter += 1;
      const id = `off-new-${offCounter}`;
      firstApproverByJob.delete(id);
      const job = OffboardingJobSchema.parse({
        id,
        accountId: parsed.data.accountId,
        tenantId: parsed.data.tenantId,
        steps: OFFBOARDING_STEPS.map((name) => ({
          name,
          status: name === "freeze_writes" || name === "export_ready" ? "done" : "pending",
        })),
        status: "running",
        shredCertificateId: null,
        requestedByStaffId: viewer.staff.id,
        createdAt: nowIso(),
      });
      controlDb.offboardingJobs.unshift(job);
      return HttpResponse.json(job as JsonBodyType, { status: 201 });
    }),
  ),
  http.post(`*${CONTROL_API_BASE}/offboarding-jobs/:id/confirm-download`, ({ request, params }) =>
    guarded(request, async (viewer) => {
      const job = visibleTo(viewer, controlDb.offboardingJobs).find((j) => j.id === params["id"]);
      if (!job) throw new ApiFailure("not_found");
      const byName = new Map(job.steps.map((s) => [s.name, s.status]));
      if (
        job.status === "failed" ||
        byName.get("export_ready") !== "done" ||
        byName.get("export_downloaded") !== "pending"
      ) {
        throw new ApiFailure("conflict");
      }
      const updated = OffboardingJobSchema.parse({
        ...job,
        steps: job.steps.map((s) =>
          s.name === "export_downloaded" ? { ...s, status: "done" as const } : s,
        ),
        status: "running",
      });
      controlDb.offboardingJobs = controlDb.offboardingJobs.map((j) =>
        j.id === updated.id ? updated : j,
      );
      return HttpResponse.json(updated as JsonBodyType);
    }),
  ),
  http.post(`*${CONTROL_API_BASE}/offboarding-jobs/:id/approve-destroy`, ({ request, params }) =>
    guarded(request, async (viewer) => {
      const job = visibleTo(viewer, controlDb.offboardingJobs).find((j) => j.id === params["id"]);
      if (!job) throw new ApiFailure("not_found");
      const byName = new Map(job.steps.map((s) => [s.name, s.status]));
      if (
        job.status === "failed" ||
        byName.get("export_downloaded") !== "done" ||
        byName.get("keys_destroyed") !== "pending"
      ) {
        throw new ApiFailure("conflict");
      }
      const firstApprover = firstApproverByJob.get(job.id);
      if (!firstApprover) {
        firstApproverByJob.set(job.id, viewer.staff.id);
        return HttpResponse.json(job as JsonBodyType);
      }
      if (firstApprover === viewer.staff.id) {
        throw new ApiFailure("conflict");
      }
      offCounter += 1;
      const cert = ShredCertificateSchema.parse({
        id: `shc-new-${offCounter}`,
        tenantId: job.tenantId,
        keyIds: [
          `key-${job.tenantId}-tenant-data`,
          `key-${job.tenantId}-field-identity`,
          `key-${job.tenantId}-field-finance`,
        ],
        destroyedAt: nowIso(),
        signingKeyId: "nexus-shred-2026",
        signature: MOCK_SIGNATURE,
      });
      controlDb.shredCertificates.unshift(cert);
      const updated = OffboardingJobSchema.parse({
        ...job,
        steps: job.steps.map((s) => ({ ...s, status: "done" as const })),
        status: "done",
        shredCertificateId: cert.id,
      });
      controlDb.offboardingJobs = controlDb.offboardingJobs.map((j) =>
        j.id === updated.id ? updated : j,
      );
      return HttpResponse.json(updated as JsonBodyType);
    }),
  ),
  http.post(`*${CONTROL_API_BASE}/offboarding-jobs/:id/retry`, ({ request, params }) =>
    guarded(request, async (viewer) => {
      const job = visibleTo(viewer, controlDb.offboardingJobs).find((j) => j.id === params["id"]);
      if (!job) throw new ApiFailure("not_found");
      if (job.status !== "failed") throw new ApiFailure("conflict");
      if (hasOpenTenantJob(job.tenantId, job.id)) throw new ApiFailure("conflict", OPEN_JOB);
      let firstFailedSeen = false;
      const steps = job.steps.map((s) => {
        if (s.status === "done") return s;
        if (!firstFailedSeen) {
          firstFailedSeen = true;
          return { ...s, status: "running" as const };
        }
        return { ...s, status: "pending" as const };
      });
      const updated = OffboardingJobSchema.parse({
        ...job,
        steps,
        status: "running",
      });
      controlDb.offboardingJobs = controlDb.offboardingJobs.map((j) =>
        j.id === updated.id ? updated : j,
      );
      return HttpResponse.json(updated as JsonBodyType);
    }),
  ),
];
