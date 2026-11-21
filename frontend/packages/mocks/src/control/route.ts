import { pageSchema, type ControlPermission } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import { z } from "zod";
import { ApiFailure, failureResponse, paginate } from "../context";
import { applyScenario, readScenario, type Scenario } from "../scenarios";
import { readStaff, visibleTo, type StaffViewer } from "./context";

/** Mock Control API (D50). The real control backend is the Stage 2 build step. */
export const CONTROL_API_BASE = "/control/api/v1";

export interface ControlRouteContext {
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly viewer: StaffViewer;
  readonly scenario: Scenario | null;
}

async function run(request: Request, answer: () => Response): Promise<Response> {
  const early = await applyScenario(readScenario(request));
  if (early) return early;
  try {
    return answer();
  } catch (error) {
    if (error instanceof ApiFailure) return failureResponse(error);
    throw error;
  }
}

/** `GET /control/api/v1<path>`: scenario → 401 (no staff) → 403 (no permission) → handler. */
export function controlGet(
  path: string,
  permission: ControlPermission | null,
  resolve: (ctx: ControlRouteContext) => Response,
): HttpHandler {
  return http.get(`*${CONTROL_API_BASE}${path}`, ({ request, params }) =>
    run(request, () => {
      const viewer = readStaff(request);
      if (permission !== null && !viewer.permissions.has(permission)) {
        throw new ApiFailure("forbidden");
      }
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) if (typeof v === "string") flat[k] = v;
      return resolve({
        request,
        url: new URL(request.url),
        params: flat,
        viewer,
        scenario: readScenario(request),
      });
    }),
  );
}

export function controlOk(schema: z.ZodType, body: unknown): Response {
  return HttpResponse.json(schema.parse(body) as JsonBodyType);
}

/** One readable resource: a list with filters (page envelope, D15) and, with `key`, a detail route. */
export interface ControlResource<T extends object> {
  readonly path: string;
  readonly schema: z.ZodType<T>;
  readonly rows: () => readonly T[];
  readonly permission: ControlPermission;
  /** Query parameters that filter on the field of the same name (exact match). */
  readonly filters?: readonly (keyof T & string)[];
  /** Field used by `GET /<path>/:id`; omit for list-only resources. */
  readonly key?: keyof T & string;
}

export function resourceHandlers<T extends object>(r: ControlResource<T>): HttpHandler[] {
  const listSchema = pageSchema(r.schema);
  const handlers = [
    controlGet(`/${r.path}`, r.permission, (ctx) => {
      let rows = visibleTo(ctx.viewer, r.rows());
      for (const field of r.filters ?? []) {
        const wanted = ctx.url.searchParams.get(field)?.trim();
        if (wanted) rows = rows.filter((row) => String(row[field]) === wanted);
      }
      return controlOk(listSchema, paginate(ctx.scenario === "empty" ? [] : rows, ctx.url));
    }),
  ];
  const key = r.key;
  if (key !== undefined) {
    handlers.push(
      controlGet(`/${r.path}/:id`, r.permission, (ctx) => {
        const row = visibleTo(ctx.viewer, r.rows()).find(
          (x) => String(x[key]) === ctx.params["id"],
        );
        if (row === undefined) throw new ApiFailure("not_found");
        return controlOk(r.schema, row);
      }),
    );
  }
  return handlers;
}
