import {
  AuditEventSchema,
  EmailSchema,
  IdSchema,
  IsoDateSchema,
  NameSchema,
  PermissionCodeSchema,
  RoleScopeSchema,
  ScopeKindSchema,
  SsoProtocolSchema,
  type AuditEvent,
  type RoleScope,
} from "@nexus/contracts";
import { HttpResponse, http, type HttpHandler } from "msw";
import { z } from "zod";
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

/* M02 write inputs and helpers (NEX-016). Inputs mirror `@nexus/services` m02. */

export const InviteUserInputSchema = z.strictObject({
  legalName: NameSchema,
  email: EmailSchema,
  roleId: IdSchema,
  scope: RoleScopeSchema,
});

export const UserStatusInputSchema = z.strictObject({ status: z.enum(["active", "suspended"]) });

export const RoleInputSchema = z.strictObject({
  name: NameSchema,
  permissions: z.array(PermissionCodeSchema).min(1),
  allowedScopeKinds: z.array(ScopeKindSchema).min(1),
});

export const AssignmentInputSchema = z
  .strictObject({
    userId: IdSchema,
    roleId: IdSchema,
    scope: RoleScopeSchema,
    effectiveFrom: IsoDateSchema,
    effectiveTo: IsoDateSchema.nullable(),
  })
  .refine((a) => a.effectiveTo === null || a.effectiveTo >= a.effectiveFrom, {
    message: "effectiveTo is before effectiveFrom",
    path: ["effectiveTo"],
  });

const DomainSchema = z
  .string()
  .regex(/^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, {
    message: "Must be a lower-case domain, e.g. riverside.example.edu",
  });

export const SsoProviderInputSchema = z.strictObject({
  institutionId: IdSchema.nullable(),
  protocol: SsoProtocolSchema,
  name: NameSchema,
  issuerUrl: z.url({ protocol: /^https$/, message: "Issuer URL must start with https://" }),
  clientId: z.string().trim().min(1).max(256),
  domains: z.array(DomainSchema).min(1),
  scimEnabled: z.boolean(),
  enabled: z.boolean(),
});

/** Admin-capable = may manage roles; a user may not drop their own last one (NEX-016). */
export const ADMIN_PERMISSION = "m02.role.manage";

export const newId = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID().slice(0, 8)}`;

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

/** POST / PUT / DELETE under M02 with one needed permission (or `null` = any signed-in user). */
export function writeRoute(
  method: "post" | "put" | "delete",
  path: string,
  permission: string | null,
  resolve: (ctx: RouteContext) => Promise<Response>,
): HttpHandler {
  return http[method](`*${API_BASE}${path}`, async ({ request, params }) => {
    const early = await applyScenario(readScenario(request));
    if (early) return early;
    try {
      const viewer = readViewer(request);
      if (!entitled(viewer.tenantId, "M02")) throw new ApiFailure("module_disabled");
      if (permission !== null && !viewer.permissions.has(permission)) {
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

export function created(body: unknown): Response {
  return HttpResponse.json(body as Parameters<typeof HttpResponse.json>[0], { status: 201 });
}

export async function appendAudit(
  viewer: Viewer,
  action: string,
  targetType: string,
  targetId: string,
  fields: readonly string[],
): Promise<void> {
  const tenantEvents = ofTenant(mockDb.auditEvents, viewer.tenantId);
  const prevHash = tenantEvents[tenantEvents.length - 1]?.hash ?? null;
  const id = newId("aud");
  const occurredAt = new Date().toISOString();
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(auditHashInput({ id, occurredAt, action, prevHash })),
  );
  const hash = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  const event: AuditEvent = AuditEventSchema.parse({
    id,
    tenantId: viewer.tenantId,
    occurredAt,
    actorKind: "user",
    actorId: viewer.userId,
    grantId: null,
    action,
    moduleId: "M02",
    targetType,
    targetId,
    deviceId: null,
    changes: fields.map((field) => ({ field, sensitive: false })),
    prevHash,
    hash,
  });
  mockDb.auditEvents.push(event);
}

/** 400 unless the role allows the scope kind and the scope target is one of this tenant's. */
export function assertScope(tenantId: string, allowed: readonly string[], scope: RoleScope): void {
  if (!allowed.includes(scope.kind)) {
    throw new ApiFailure("invalid_request", [
      { path: "scope.kind", message: `This role cannot be given in a ${scope.kind} scope` },
    ]);
  }
  const target = scope.targetId;
  const exists =
    scope.kind === "own" ||
    scope.kind === "department" ||
    scope.kind === "class" ||
    (scope.kind === "group" &&
      mockDb.groups.some((g) => g.id === target && g.tenantId === tenantId)) ||
    (scope.kind === "institution" &&
      mockDb.institutions.some((i) => i.id === target && i.tenantId === tenantId)) ||
    (scope.kind === "campus" &&
      mockDb.campuses.some((c) => c.id === target && c.tenantId === tenantId));
  if (!exists) {
    throw new ApiFailure("invalid_request", [
      { path: "scope.targetId", message: "Scope target is not part of this tenant" },
    ]);
  }
}

/** True when `userId` keeps an admin-capable assignment other than `exceptAssignmentId`. */
export function keepsAdmin(tenantId: string, userId: string, exceptAssignmentId: string): boolean {
  return ofTenant(mockDb.roleAssignments, tenantId).some((a) => {
    if (a.userId !== userId || a.id === exceptAssignmentId) return false;
    const role = mockDb.roles.find((r) => r.id === a.roleId && r.tenantId === tenantId);
    return role?.permissions.includes(ADMIN_PERMISSION) ?? false;
  });
}

export type { RouteContext };
