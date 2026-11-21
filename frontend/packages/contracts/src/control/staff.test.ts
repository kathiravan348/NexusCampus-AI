import { describe, expect, it } from "vitest";
import { StaffSessionSchema, StaffUserSchema } from "./staff";
import { rejects } from "./test-utils";

const staff = {
  id: "stf_meera",
  displayName: "Meera Iyer",
  workEmail: "meera@nexuscampus.example",
  roles: ["support"],
  partnerId: null,
  mfaEnrolled: true,
  active: true,
  lastSignInAt: "2026-11-20T09:00:00Z",
};

describe("StaffUser", () => {
  it("accepts staff and a partner user", () => {
    expect(StaffUserSchema.safeParse(staff).success).toBe(true);
    expect(
      StaffUserSchema.safeParse({ ...staff, roles: ["partner"], partnerId: "ptn_south" }).success,
    ).toBe(true);
  });

  it("rejects no roles, duplicates, unknown roles and a partner without partnerId", () => {
    rejects(StaffUserSchema, [
      { ...staff, roles: [] },
      { ...staff, roles: ["support", "support"] },
      { ...staff, roles: ["root"] },
      { ...staff, roles: ["partner"] },
      { ...staff, partnerId: "ptn_south" },
      { ...staff, workEmail: "not-an-email" },
      { ...staff, password: "x" },
    ]);
  });
});

describe("StaffSession", () => {
  const session = {
    staff,
    permissions: ["ctl.account.read", "ctl.ticket.reply"],
    mfaVerified: true,
    expiresAt: "2026-11-20T17:00:00Z",
  };

  it("accepts a session with MFA", () => {
    expect(StaffSessionSchema.safeParse(session).success).toBe(true);
  });

  it("rejects a session without MFA and bad permission codes", () => {
    rejects(StaffSessionSchema, [
      { ...session, mfaVerified: false },
      { ...session, permissions: ["m02.user.read"] },
      { ...session, permissions: ["ctl.account.read", "ctl.account.read"] },
    ]);
  });
});
