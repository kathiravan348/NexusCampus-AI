import type { ControlPermission, StaffSession, StaffUser } from "@nexus/contracts";
import { ApiFailure } from "../context";
import { controlDb } from "./db";
import { CONTROL_ROLE_PERMISSIONS } from "./fixtures";

/** Mock staff sign-in header (the real control backend uses its own staff SSO + MFA session, P13). */
export const CONTROL_HEADER = { staff: "X-Nexus-Staff" } as const;

/** Mock session length: one working day. */
const SESSION_MS = 8 * 3_600_000;

export interface StaffViewer {
  readonly staff: StaffUser;
  readonly permissions: ReadonlySet<ControlPermission>;
  /** Accounts a partner user may see; `null` = not limited (our own staff). */
  readonly accountIds: ReadonlySet<string> | null;
}

export function permissionsOfStaff(staff: StaffUser): Set<ControlPermission> {
  return new Set(staff.roles.flatMap((role) => CONTROL_ROLE_PERMISSIONS[role]));
}

/** 401 unless the header names an active, MFA-enrolled staff member. */
export function readStaff(request: Request): StaffViewer {
  const id = request.headers.get(CONTROL_HEADER.staff);
  const staff = controlDb.staff.find((s) => s.id === id);
  if (!staff || !staff.active || !staff.mfaEnrolled) throw new ApiFailure("unauthorized");
  const accountIds =
    staff.partnerId === null
      ? null
      : new Set(controlDb.accounts.filter((a) => a.partnerId === staff.partnerId).map((a) => a.id));
  return { staff, permissions: permissionsOfStaff(staff), accountIds };
}

export function sessionOf(viewer: StaffViewer, now = Date.now()): StaffSession {
  return {
    staff: viewer.staff,
    permissions: [...viewer.permissions].sort(),
    mfaVerified: true,
    expiresAt: new Date(now + SESSION_MS).toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

/** Partner users only see rows of the accounts they manage (P12). */
export function visibleTo<T>(viewer: StaffViewer, rows: readonly T[]): T[] {
  const allowed = viewer.accountIds;
  if (allowed === null) return [...rows];
  return rows.filter((row) => {
    const accountId = (row as { accountId?: unknown }).accountId;
    const id = (row as { id?: unknown }).id;
    if (typeof accountId === "string") return allowed.has(accountId);
    return typeof id === "string" && allowed.has(id);
  });
}
