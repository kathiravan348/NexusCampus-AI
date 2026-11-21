import { LicenceFileSchema, LicenceSchema, type Licence } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { ApiFailure, failureResponse } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { readStaff, visibleTo, type StaffViewer } from "../context";
import { controlDb } from "../db";
import { MOCK_SIGNATURE } from "../fixtures";
import { CONTROL_API_BASE } from "../route";

let renewCounter = 0;

async function issuer(
  request: Request,
  answer: (viewer: StaffViewer) => Response,
): Promise<Response> {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    const viewer = readStaff(request);
    if (!viewer.permissions.has("ctl.licence.issue")) throw new ApiFailure("forbidden");
    return answer(viewer);
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

/** `YYYY-MM-DD` one year later (29 Feb → 28 Feb). */
function plusYear(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC((y ?? 0) + 1, (m ?? 1) - 1, d ?? 1));
  if (next.getUTCMonth() !== (m ?? 1) - 1) next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}

/** The signed terms an install loads (state, fingerprint and deployment are ours, not in the file). */
function licenceFile(l: Licence) {
  const payload = {
    id: l.id,
    accountId: l.accountId,
    edition: l.edition,
    modules: l.modules,
    learnerCap: l.learnerCap,
    campusCap: l.campusCap,
    issuedAt: l.issuedAt,
    expiresAt: l.expiresAt,
    supportEndsAt: l.supportEndsAt,
    graceDays: l.graceDays,
    activation: l.activation,
    signingKeyId: l.signingKeyId,
  };
  return LicenceFileSchema.parse({ format: "nexus-licence/1", payload, signature: MOCK_SIGNATURE });
}

/** P05 demo writes. Real files are signed by the control backend's signing service (Ed25519, D23). */
export const p05Handlers: HttpHandler[] = [
  http.get(`*${CONTROL_API_BASE}/licence-files/:id`, ({ request, params }) =>
    issuer(request, (viewer) => {
      const licence = visibleTo(viewer, controlDb.licences).find((l) => l.id === params["id"]);
      if (!licence) throw new ApiFailure("not_found");
      return HttpResponse.json(licenceFile(licence) as JsonBodyType);
    }),
  ),
  http.post(`*${CONTROL_API_BASE}/licences/:id/renew`, ({ request, params }) =>
    issuer(request, (viewer) => {
      const licence = visibleTo(viewer, controlDb.licences).find((l) => l.id === params["id"]);
      if (!licence) throw new ApiFailure("not_found");
      if (licence.state === "revoked") throw new ApiFailure("conflict");
      renewCounter += 1;
      const renewed = LicenceSchema.parse({
        ...licence,
        issuedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        expiresAt: licence.expiresAt === null ? null : plusYear(licence.expiresAt),
        supportEndsAt: plusYear(licence.supportEndsAt),
        state: "active",
        fingerprint: renewCounter.toString(16).padStart(4, "0").repeat(16),
      });
      controlDb.licences = controlDb.licences.map((l) => (l.id === renewed.id ? renewed : l));
      return HttpResponse.json(renewed as JsonBodyType);
    }),
  ),
];
