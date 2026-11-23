import {
  ApiErrorSchema,
  PageQuerySchema,
  type ApiErrorCode,
  type ApiErrorDetail,
  type ModuleId,
  type Page,
  type Person,
} from "@nexus/contracts";
import { HttpResponse } from "msw";
import { mockDb } from "./db";

/** Request headers the mock API reads instead of a real session (demo sign-in, NEX-012). */
export const MOCK_HEADER = {
  tenant: "X-Nexus-Tenant",
  user: "X-Nexus-User",
  scenario: "X-Nexus-Scenario",
} as const;

const STATUS: Readonly<Record<ApiErrorCode, number>> = {
  invalid_request: 400,
  unauthorized: 401,
  forbidden: 403,
  module_disabled: 403,
  not_found: 404,
  conflict: 409,
  tenant_frozen: 423,
  rate_limited: 429,
  internal: 500,
};

const MESSAGE: Readonly<Record<ApiErrorCode, string>> = {
  invalid_request: "The request is not valid.",
  unauthorized: "Sign in to continue.",
  forbidden: "You do not have permission for this.",
  module_disabled: "This module is not part of the institution's plan.",
  not_found: "Not found.",
  conflict: "The record changed in the meantime.",
  tenant_frozen: "This institution is frozen. Changes are not saved.",
  rate_limited: "Too many requests. Try again shortly.",
  internal: "Something went wrong.",
};

/** Thrown inside a handler to answer with an `ApiError` (caught by the route wrapper). */
export class ApiFailure extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly details?: ApiErrorDetail[],
  ) {
    super(MESSAGE[code]);
  }
}

/** An `ApiError` response (D15), validated against its contract. */
export function apiError(status: number, code: ApiErrorCode, details?: ApiErrorDetail[]): Response {
  const body = ApiErrorSchema.parse({
    error: { code, message: MESSAGE[code], ...(details ? { details } : {}) },
  });
  return HttpResponse.json(body, { status });
}

export function failureResponse(failure: ApiFailure): Response {
  return apiError(STATUS[failure.code], failure.code, failure.details);
}

/** Who is calling: from the mock headers, checked against the mock DB. */
export interface Viewer {
  readonly tenantId: string;
  readonly userId: string;
  readonly personId: string;
  readonly permissions: ReadonlySet<string>;
}

/** Permission codes of a user: union of the roles assigned to them. */
export function permissionsOf(userId: string): Set<string> {
  const out = new Set<string>();
  for (const a of mockDb.roleAssignments) {
    if (a.userId !== userId) continue;
    const role = mockDb.roles.find((r) => r.id === a.roleId && r.tenantId === a.tenantId);
    for (const code of role?.permissions ?? []) out.add(code);
  }
  return out;
}

export function can(userId: string, permission: string): boolean {
  return permissionsOf(userId).has(permission);
}

/** True when the tenant's plan has the module switched on (core modules always are). */
export function entitled(tenantId: string, moduleId: ModuleId): boolean {
  return mockDb.entitlements.some(
    (e) => e.tenantId === tenantId && e.moduleId === moduleId && e.enabled,
  );
}

/** 401 unless both headers name an active user of that tenant. */
export function readViewer(request: Request): Viewer {
  const tenantId = request.headers.get(MOCK_HEADER.tenant);
  const userId = request.headers.get(MOCK_HEADER.user);
  const user = mockDb.users.find((u) => u.id === userId && u.tenantId === tenantId);
  if (!tenantId || !user || user.status !== "active") throw new ApiFailure("unauthorized");
  return {
    tenantId,
    userId: user.id,
    personId: user.personId,
    permissions: permissionsOf(user.id),
  };
}

/** Only the rows of one tenant (D22): handlers never return another tenant's records. */
export function ofTenant<T extends { tenantId: string }>(
  items: readonly T[],
  tenantId: string,
): T[] {
  return items.filter((item) => item.tenantId === tenantId);
}

/** `?page=&pageSize=` → one page (D15); 400 `invalid_request` on bad input. */
export function paginate<T>(items: readonly T[], url: URL): Page<T> {
  const raw: Record<string, number> = {};
  for (const key of ["page", "pageSize"] as const) {
    const value = url.searchParams.get(key);
    if (value !== null) raw[key] = value.trim() === "" ? Number.NaN : Number(value);
  }
  const query = PageQuerySchema.safeParse(raw);
  if (!query.success) {
    throw new ApiFailure(
      "invalid_request",
      query.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  const { page, pageSize } = query.data;
  const start = (page - 1) * pageSize;
  return { items: items.slice(start, start + pageSize), total: items.length, page, pageSize };
}

/** People the viewer may see unmasked as family: themselves and the learners they are guardian of. */
export function familyOf(viewer: Viewer): Set<string> {
  const ids = new Set([viewer.personId]);
  for (const link of mockDb.guardianLinks) {
    if (link.tenantId === viewer.tenantId && link.guardianPersonId === viewer.personId) {
      ids.add(link.learnerPersonId);
    }
  }
  return ids;
}

/** Restricted-data permission (G-6), from the NEX-010 catalogue. */
export const READ_RESTRICTED = "m02.person.read_restricted";

/**
 * Minors' date of birth, phone and email become `null` unless the viewer has the restricted-data
 * permission, is the person, or is their linked guardian (G-6).
 */
export function maskPerson(person: Person, viewer: Viewer): Person {
  if (!person.isMinor) return person;
  if (viewer.permissions.has(READ_RESTRICTED) || familyOf(viewer).has(person.id)) return person;
  return { ...person, dateOfBirth: null, phone: null, email: null };
}
