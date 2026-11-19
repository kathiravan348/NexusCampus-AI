import { AuditEventSchema, type AuditEvent, type ModuleId } from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler, type JsonBodyType } from "msw";
import type { z } from "zod";
import {
  ApiFailure,
  entitled,
  failureResponse,
  ofTenant,
  readViewer,
  type Viewer,
} from "../context";
import { mockDb } from "../db";
import { auditHashInput } from "../fixtures/audit";
import { applyScenario, readScenario } from "../scenarios";
import { API_BASE, type RouteContext } from "./route";

/*
 * Shared helpers for mock write routes (NEX-018 onwards): entitlement + permission checks, JSON body
 * parsing into `invalid_request` details, and appending to the tenant's hash-chained audit log (E-3).
 */

export interface WriteOptions {
  readonly module: ModuleId;
  /** Needed permission; `null` = any signed-in user of an entitled tenant. */
  readonly permission: string | null;
}

/** `POST | PUT | PATCH | DELETE /api/v1<path>`: scenario → 401 → 403 `module_disabled` → 403 → handler. */
export function writeRoute(
  method: "post" | "put" | "patch" | "delete",
  path: string,
  options: WriteOptions,
  resolve: (ctx: RouteContext) => Promise<Response>,
): HttpHandler {
  return http[method](`*${API_BASE}${path}`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, options.module)) throw new ApiFailure("module_disabled");
      if (options.permission !== null && !viewer.permissions.has(options.permission)) {
        throw new ApiFailure("forbidden");
      }
      const flat: Record<string, string> = {};
      for (const [k, v] of Object.entries(params)) if (typeof v === "string") flat[k] = v;
      return await resolve({
        request,
        url: new URL(request.url),
        params: flat,
        viewer,
        scenario: readScenario(request),
      });
    } catch (error) {
      if (error instanceof ApiFailure) return failureResponse(error);
      throw error;
    }
  });
}

/** The JSON body parsed by `schema`, or 400 `invalid_request` with one detail per issue. */
export async function readBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ApiFailure("invalid_request", [{ path: "", message: "Invalid JSON body" }]);
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiFailure(
      "invalid_request",
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  return parsed.data;
}

export function json(body: unknown, status = 200): Response {
  return HttpResponse.json(body as JsonBodyType, { status });
}

export const newId = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;

export interface AuditEntry {
  readonly module: ModuleId;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string | null;
  /** Changed field names only — never values. */
  readonly fields: readonly string[];
}

/** Appends one user event to the viewer's tenant chain (`prevHash` = last event's `hash`). */
export async function appendAudit(viewer: Viewer, entry: AuditEntry): Promise<AuditEvent> {
  const tenantEvents = ofTenant(mockDb.auditEvents, viewer.tenantId);
  const prevHash = tenantEvents[tenantEvents.length - 1]?.hash ?? null;
  const id = newId("aud");
  const occurredAt = new Date().toISOString();
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(auditHashInput({ id, occurredAt, action: entry.action, prevHash })),
  );
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const event = AuditEventSchema.parse({
    id,
    tenantId: viewer.tenantId,
    occurredAt,
    actorKind: "user",
    actorId: viewer.userId,
    grantId: null,
    action: entry.action,
    moduleId: entry.module,
    targetType: entry.targetType,
    targetId: entry.targetId,
    deviceId: null,
    changes: entry.fields.map((field) => ({ field, sensitive: false })),
    prevHash,
    hash,
  });
  mockDb.auditEvents.push(event);
  return event;
}
