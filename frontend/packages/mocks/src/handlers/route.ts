import type { ModuleId, Page } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import {
  ApiFailure,
  entitled,
  failureResponse,
  paginate,
  readViewer,
  type Viewer,
} from "../context";
import { applyScenario, readScenario, type Scenario } from "../scenarios";

export const API_BASE = "/api/v1";

/** Any schema with `parse` (a Zod schema from `@nexus/contracts` or a local response schema). */
export interface Parser<T> {
  parse(value: unknown): T;
}

export interface RouteContext {
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  readonly viewer: Viewer;
  readonly scenario: Scenario | null;
}

export interface RouteOptions {
  readonly module: ModuleId;
  /** Needed permission; with a list, any one of them is enough. */
  readonly permission?: string | readonly string[];
}

function flatParams(params: Readonly<Record<string, unknown>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
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

/** `GET /api/v1<path>`: scenario → 401 → 403 `module_disabled` → 403 `forbidden` → handler. */
export function get(
  path: string,
  options: RouteOptions,
  resolve: (ctx: RouteContext) => Response,
): HttpHandler {
  return http.get(`*${API_BASE}${path}`, ({ request, params }) =>
    run(request, () => {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, options.module)) throw new ApiFailure("module_disabled");
      const needed = options.permission === undefined ? [] : [options.permission].flat();
      if (needed.length > 0 && !needed.some((p) => viewer.permissions.has(p))) {
        throw new ApiFailure("forbidden");
      }
      return resolve({
        request,
        url: new URL(request.url),
        params: flatParams(params),
        viewer,
        scenario: readScenario(request),
      });
    }),
  );
}

/** A mock-only route that needs no tenant or user headers (e.g. the demo sign-in list). */
export function getPublic(
  path: string,
  resolve: (ctx: { url: URL; scenario: Scenario | null }) => Response,
): HttpHandler {
  return http.get(`*${API_BASE}${path}`, ({ request }) =>
    run(request, () => resolve({ url: new URL(request.url), scenario: readScenario(request) })),
  );
}

/** 200 with a body validated against its schema (fails loudly when a mock drifts from its contract). */
export function ok<T>(schema: Parser<T>, body: unknown): Response {
  return HttpResponse.json(schema.parse(body) as JsonBodyType);
}

/** 200 with one page of `items`; the `empty` scenario returns an empty page. */
export function list<T>(ctx: RouteContext, items: readonly T[], schema: Parser<Page<T>>): Response {
  return ok(schema, paginate(ctx.scenario === "empty" ? [] : items, ctx.url));
}

/** A query value, or `null` when missing or blank (a blank filter means "no filter"). */
export function param(url: URL, key: string): string | null {
  const value = url.searchParams.get(key)?.trim();
  return value ? value : null;
}

/** The item or 404 `not_found` (also for another tenant's id). */
export function found<T>(item: T | undefined): T {
  if (item === undefined) throw new ApiFailure("not_found");
  return item;
}
