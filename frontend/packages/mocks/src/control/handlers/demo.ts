import { pageSchema, StaffUserSchema } from "@nexus/contracts";
import { http, type HttpHandler } from "msw";
import { paginate } from "../../context";
import { applyScenario, readScenario } from "../../scenarios";
import { controlDb } from "../db";
import { CONTROL_API_BASE, controlOk } from "../route";

const StaffPage = pageSchema(StaffUserSchema);

/** Mock-only staff picker for the demo sign-in (NEX-071). The real app signs in through staff SSO + MFA. */
export const demoHandlers: HttpHandler[] = [
  http.get(`*${CONTROL_API_BASE}/demo/staff`, async ({ request }) => {
    const scenario = readScenario(request);
    const early = await applyScenario(scenario);
    if (early) return early;
    const active = controlDb.staff.filter((s) => s.active && s.mfaEnrolled);
    return controlOk(StaffPage, paginate(scenario === "empty" ? [] : active, new URL(request.url)));
  }),
];
