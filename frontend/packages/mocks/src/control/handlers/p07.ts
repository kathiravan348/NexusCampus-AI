import { DeploymentSchema, ReleaseSchema, RolloutSchema } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { z } from "zod";
import { ApiFailure, failureResponse } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff } from "../context";
import { controlDb } from "../db";
import { CONTROL_API_BASE } from "../route";

const PublishSchema = z.strictObject({ notesReviewed: z.boolean().optional() });
const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

async function manager(request: Request, answer: () => Promise<Response>): Promise<Response> {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readStaff(request);
    if (!viewer.permissions.has("ctl.release.manage")) throw new ApiFailure("forbidden");
    return await answer();
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

/** P07 demo writes. Real signing and image builds belong to the release pipeline (Stage 2 build step). */
export const p07Handlers: HttpHandler[] = [
  http.post(`*${CONTROL_API_BASE}/releases/:id/publish`, ({ request, params }) =>
    manager(request, async () => {
      const body = PublishSchema.safeParse(await request.json().catch(() => ({})));
      if (!body.success) throw new ApiFailure("invalid_request");
      const release = controlDb.releases.find((r) => r.id === params["id"]);
      if (!release) throw new ApiFailure("not_found");
      if (release.status !== "draft") throw new ApiFailure("conflict");
      if (release.notesAiDrafted && body.data.notesReviewed !== true) {
        throw new ApiFailure("invalid_request", [
          {
            path: "notesReviewed",
            message: "AI-drafted release notes must be reviewed by a person.",
          },
        ]);
      }
      const published = ReleaseSchema.parse({
        ...release,
        status: "published",
        signed: true,
        publishedAt: nowIso(),
      });
      controlDb.releases = controlDb.releases.map((r) => (r.id === published.id ? published : r));
      return HttpResponse.json(published as JsonBodyType);
    }),
  ),
  http.post(`*${CONTROL_API_BASE}/rollouts/:id/start`, ({ request, params }) =>
    manager(request, async () => {
      const rollout = controlDb.rollouts.find((r) => r.id === params["id"]);
      if (!rollout) throw new ApiFailure("not_found");
      const release = controlDb.releases.find((r) => r.id === rollout.releaseId);
      if (!release || release.status !== "published") throw new ApiFailure("conflict");
      if (rollout.status !== "pending") throw new ApiFailure("conflict");
      const earlier = controlDb.rollouts.filter(
        (r) => r.releaseId === rollout.releaseId && r.ring < rollout.ring,
      );
      if (earlier.some((r) => r.status !== "done")) throw new ApiFailure("conflict");
      const done = RolloutSchema.parse({ ...rollout, status: "done", startedAt: nowIso() });
      controlDb.rollouts = controlDb.rollouts.map((r) => (r.id === done.id ? done : r));
      controlDb.deployments = controlDb.deployments.map((d) =>
        done.deploymentIds.includes(d.id)
          ? DeploymentSchema.parse({ ...d, version: release.version })
          : d,
      );
      return HttpResponse.json(done as JsonBodyType);
    }),
  ),
];
