import { EntitlementSchema, PermissionSchema, RoleSchema } from "@nexus/contracts";
import {
  isKnownMessageKey,
  LOCALE_CATALOGS,
  MESSAGE_DESCRIPTIONS,
  SOURCE_MESSAGES,
} from "@nexus/i18n/resolve";
import { describe, expect, it } from "vitest";
import { roleId, SYSTEM_ROLE_KEYS, TENANT } from "./ids";
import { demoAccessFixtures } from "./stage3-access";
import {
  stage4AccessFixtures,
  STAGE4_ENTITLEMENTS,
  STAGE4_PERMISSIONS,
  STAGE4_ROLE_PERMISSIONS,
} from "./stage4-access";
import { DEMO_TENANTS } from "./tenants";

const common = ["M29", "M30", "M31", "M32", "M33", "M35", "M36", "M38", "M39", "M44", "M45", "M46"];
const expectedEntitlements = {
  [TENANT.littleSteps]: [...common, "M37", "M91"],
  [TENANT.riverside]: common,
  [TENANT.northbridge]: [...common, "M34", "M42"],
  [TENANT.apex]: [...common, "M34", "M40", "M43"],
  [TENANT.harmony]: [...common, "M41", "M43", "M91"],
};
const codes = STAGE4_PERMISSIONS.map(({ code }) => code);

describe("Stage 4 access fixtures (D87)", () => {
  it("defines unique permission codes for exactly the Stage 4 modules", () => {
    const stage4Modules = new Set(Object.values(expectedEntitlements).flat());
    const priorCodes = new Set(demoAccessFixtures().permissions.map(({ code }) => code));
    expect(codes).toHaveLength(54);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(STAGE4_PERMISSIONS.map(({ moduleId }) => moduleId))).toEqual(stage4Modules);
    for (const permission of STAGE4_PERMISSIONS) {
      expect(PermissionSchema.safeParse(permission).error, permission.code).toBeUndefined();
      expect(permission.moduleId).toBe(permission.code.slice(0, 3).toUpperCase());
      expect(priorCodes.has(permission.code), permission.code).toBe(false);
    }
  });

  it("marks the restricted permissions as sensitive", () => {
    expect(STAGE4_PERMISSIONS.filter(({ sensitive }) => sensitive).map(({ code }) => code)).toEqual(
      [
        "m32.submission.mark",
        "m33.response.mark",
        "m34.flag.review",
        "m35.mastery.read",
        "m35.transcript.read",
        "m37.diary.read",
        "m37.diary.record",
        "m37.pickup.check",
        "m38.plan.read",
        "m38.plan.manage",
        "m42.audit.read",
        "m43.order.read",
        "m44.results.read",
        "m45.credential.issue",
        "m46.risk.read",
        "m46.intervention.manage",
      ],
    );
  });

  it("grants only defined permissions and reserves privileged grants for owner and admin", () => {
    const privileged = ["m35.transcript.read", "m38.plan.manage", "m46.intervention.manage"];
    for (const [key, grants] of Object.entries(STAGE4_ROLE_PERMISSIONS)) {
      expect(new Set(grants).size, key).toBe(grants.length);
      expect(
        grants.every((code) => codes.includes(code)),
        key,
      ).toBe(true);
      if (key === "owner" || key === "admin") {
        expect(grants, key).toEqual(codes);
      } else {
        expect(
          grants.some((code) => privileged.includes(code)),
          key,
        ).toBe(false);
      }
    }
    const teacherExtras = [
      "m31.content.manage",
      "m32.assignment.manage",
      "m33.test.manage",
      "m33.bank.manage",
      "m91.media.manage",
    ];
    const teacherActions = [
      "read",
      "write",
      "record",
      "check",
      "host",
      "mark",
      "answer",
      "moderate",
    ];
    expect(STAGE4_ROLE_PERMISSIONS.teacher).toEqual(
      codes.filter(
        (code) =>
          !privileged.includes(code) &&
          (teacherActions.some((action) => code.endsWith(`.${action}`)) ||
            teacherExtras.includes(code)),
      ),
    );
    expect(STAGE4_ROLE_PERMISSIONS.guardian).toEqual([
      "m37.diary.read",
      "m39.library.read",
      "m44.survey.read",
      "m45.credential.read",
      "m91.portfolio.read",
    ]);
    expect(STAGE4_ROLE_PERMISSIONS.learner).toEqual([
      "m30.course.read",
      "m31.content.read",
      "m33.test.read",
      "m36.live.read",
      "m39.library.read",
      "m44.survey.read",
      "m45.credential.read",
      "m91.portfolio.read",
    ]);
  });

  it("provides only Stage 4 access additions for the existing system roles", () => {
    const { permissions, roles, entitlements } = stage4AccessFixtures();
    expect(permissions).toEqual(STAGE4_PERMISSIONS);
    expect(entitlements).toEqual(STAGE4_ENTITLEMENTS);
    expect(roles).toHaveLength(DEMO_TENANTS.length * SYSTEM_ROLE_KEYS.length);
    for (const { tenantId } of DEMO_TENANTS) {
      for (const key of SYSTEM_ROLE_KEYS) {
        const rolesForKey = roles.filter((role) => role.id === roleId(tenantId, key));
        expect(rolesForKey).toHaveLength(1);
        const [role] = rolesForKey;
        expect(RoleSchema.safeParse(role).error).toBeUndefined();
        expect(role).toMatchObject({
          tenantId,
          system: true,
          permissions: STAGE4_ROLE_PERMISSIONS[key],
        });
      }
    }
  });

  it("entitles each demo tenant to the modules for its type", () => {
    expect(STAGE4_ENTITLEMENTS).toHaveLength(Object.values(expectedEntitlements).flat().length);
    for (const [tenantId, modules] of Object.entries(expectedEntitlements)) {
      const rows = STAGE4_ENTITLEMENTS.filter((entitlement) => entitlement.tenantId === tenantId);
      expect(rows.map(({ moduleId }) => moduleId).sort(), tenantId).toEqual([...modules].sort());
      for (const row of rows) {
        expect(EntitlementSchema.safeParse(row).error).toBeUndefined();
        expect(row).toMatchObject({ source: "plan", enabled: true, expiresAt: null });
      }
    }
  });

  it("has a unique English source and description plus Hindi and Tamil translations for each permission", () => {
    const keys = STAGE4_PERMISSIONS.map(({ descriptionKey }) => descriptionKey);
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(isKnownMessageKey(key), key).toBe(true);
      if (isKnownMessageKey(key)) {
        expect(SOURCE_MESSAGES[key].trim(), key).not.toBe("");
        expect(MESSAGE_DESCRIPTIONS[key].trim(), key).not.toBe("");
      }
      expect(LOCALE_CATALOGS["hi"]?.[key]?.trim(), key).toBeTruthy();
      expect(LOCALE_CATALOGS["ta"]?.[key]?.trim(), key).toBeTruthy();
    }
  });
});
