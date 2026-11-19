import {
  ApiErrorSchema,
  TextOverrideRevisionSchema,
  TextOverrideSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER, ofTenant } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { server } from "../node";
import {
  TextOverrideDeleteResponseSchema,
  TextOverrideImportResultSchema,
  TextOverrideRollbackResponseSchema,
} from "./m04";

const BASE = "http://localhost/api/v1";
const NB_ADMIN = { tenant: TENANT.northbridge, user: USER.nbRobert };
const RV_ADMIN = { tenant: TENANT.riverside, user: USER.rvHelen };
const RV_TEACHER = { tenant: TENANT.riverside, user: USER.rvTom };
const AX_ADMIN = { tenant: TENANT.apex, user: USER.axKhalid };

function req(
  path: string,
  method: "GET" | "PUT" | "POST" | "DELETE",
  as: { tenant: string; user: string },
  body?: unknown,
) {
  return fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      [MOCK_HEADER.tenant]: as.tenant,
      [MOCK_HEADER.user]: as.user,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("m04 handlers", () => {
  it("creates, updates, deletes, and rolls back an institution override with audit events", async () => {
    const auditsBefore = ofTenant(mockDb.auditEvents, TENANT.northbridge).length;

    const createRes = await req("/texts/overrides/term.learner?locale=en-US", "PUT", NB_ADMIN, {
      message: "Scholar",
    });
    expect(createRes.status).toBe(200);
    const v1 = TextOverrideSchema.parse(await createRes.json());
    expect(v1.version).toBe(1);
    expect(v1.message).toBe("Scholar");

    const updateRes = await req("/texts/overrides/term.learner?locale=en-US", "PUT", NB_ADMIN, {
      message: "Fellow",
    });
    expect(updateRes.status).toBe(200);
    const v2 = TextOverrideSchema.parse(await updateRes.json());
    expect(v2.version).toBe(2);
    expect(v2.message).toBe("Fellow");

    const rollbackRes = await req(
      "/texts/overrides/term.learner/rollback?locale=en-US",
      "POST",
      NB_ADMIN,
      { version: 1 },
    );
    expect(rollbackRes.status).toBe(200);
    const rolled = TextOverrideRollbackResponseSchema.parse(await rollbackRes.json());
    expect(rolled.override?.message).toBe("Scholar");
    expect(rolled.override?.version).toBe(3);

    const deleteRes = await req("/texts/overrides/term.learner?locale=en-US", "DELETE", NB_ADMIN);
    expect(deleteRes.status).toBe(200);
    expect(TextOverrideDeleteResponseSchema.parse(await deleteRes.json()).version).toBe(4);

    // Revisions remain queryable after deletion, and rollback restores the deleted override
    const revRes = await req("/texts/revisions?key=term.learner&locale=en-US", "GET", NB_ADMIN);
    const revPage = pageSchema(TextOverrideRevisionSchema).parse(await revRes.json());
    expect(revPage.items.map((r) => [r.version, r.message])).toEqual([
      [1, "Scholar"],
      [2, "Fellow"],
      [3, "Scholar"],
      [4, null],
    ]);

    const restoreRes = await req(
      "/texts/overrides/term.learner/rollback?locale=en-US",
      "POST",
      NB_ADMIN,
      { version: 2 },
    );
    expect(restoreRes.status).toBe(200);
    expect(
      TextOverrideRollbackResponseSchema.parse(await restoreRes.json()).override?.message,
    ).toBe("Fellow");

    const auditsAfter = ofTenant(mockDb.auditEvents, TENANT.northbridge);
    expect(auditsAfter.length).toBe(auditsBefore + 5);
    expect(auditsAfter.slice(-5).map((e) => e.action)).toEqual([
      "m04.text.updated",
      "m04.text.updated",
      "m04.text.rolledBack",
      "m04.text.deleted",
      "m04.text.rolledBack",
    ]);
  });

  it("rejects unknown keys and invalid ICU with 400 details", async () => {
    const unknownRes = await req(
      "/texts/overrides/common.doesNotExist?locale=en-US",
      "PUT",
      NB_ADMIN,
      { message: "Hello" },
    );
    expect(unknownRes.status).toBe(400);
    const unknownErr = ApiErrorSchema.parse(await unknownRes.json()).error;
    expect(unknownErr.code).toBe("invalid_request");
    expect(unknownErr.details?.some((d) => d.path === "key")).toBe(true);

    const invalidIcuRes = await req(
      "/texts/overrides/common.syncPending?locale=en-US",
      "PUT",
      NB_ADMIN,
      { message: "{count, plural, one {broken" },
    );
    expect(invalidIcuRes.status).toBe(400);
    const icuErr = ApiErrorSchema.parse(await invalidIcuRes.json()).error;
    expect(icuErr.code).toBe("invalid_request");
    expect(icuErr.details?.some((d) => d.path === "message")).toBe(true);
  });

  it("blocks edits to group-locked keys with 409 conflict and forbids non-managers", async () => {
    const lockedRes = await req("/texts/overrides/term.learner?locale=en-GB", "PUT", RV_ADMIN, {
      message: "Student",
    });
    expect(lockedRes.status).toBe(409);
    expect(ApiErrorSchema.parse(await lockedRes.json()).error.code).toBe("conflict");

    const forbiddenRes = await req("/texts/overrides/common.save?locale=en-GB", "PUT", RV_TEACHER, {
      message: "Store",
    });
    expect(forbiddenRes.status).toBe(403);
    expect(ApiErrorSchema.parse(await forbiddenRes.json()).error.code).toBe("forbidden");

    const campusKeyRevRes = await req(
      "/texts/revisions?key=term.class&locale=en-GB",
      "GET",
      RV_ADMIN,
    );
    expect(
      pageSchema(TextOverrideRevisionSchema).parse(await campusKeyRevRes.json()).items,
    ).toEqual([]);
  });

  it("previews import diffs on dry run, rejects invalid apply with 400, and applies valid imports", async () => {
    const dryRes = await req("/texts/overrides/import", "POST", AX_ADMIN, {
      locale: "ar-AE",
      dryRun: true,
      entries: {
        "common.save": "تخزين",
        "term.learner": "متدرب أول",
        "common.unknownKey": "Nope",
        "common.syncPending": "{count, plural, one {broken",
      },
    });
    expect(dryRes.status).toBe(200);
    const dry = TextOverrideImportResultSchema.parse(await dryRes.json());
    expect(dry.dryRun).toBe(true);
    expect(dry.added).toEqual([{ key: "common.save", before: null, after: "تخزين" }]);
    expect(dry.changed).toEqual([{ key: "term.learner", before: "متدرب", after: "متدرب أول" }]);
    expect(dry.rejected.map((r) => [r.key, r.reason])).toEqual([
      ["common.unknownKey", "unknown_key"],
      ["common.syncPending", "invalid_icu"],
    ]);
    expect(dry.appliedCount).toBe(0);

    const invalidApply = await req("/texts/overrides/import", "POST", AX_ADMIN, {
      locale: "ar-AE",
      dryRun: false,
      entries: { "common.syncPending": "{count, plural, one {broken" },
    });
    expect(invalidApply.status).toBe(400);
    expect(ApiErrorSchema.parse(await invalidApply.json()).error.details?.length).toBe(1);

    const applyRes = await req("/texts/overrides/import", "POST", AX_ADMIN, {
      locale: "ar-AE",
      dryRun: false,
      entries: { "common.save": "تخزين", "term.learner": "متدرب أول" },
    });
    expect(applyRes.status).toBe(200);
    const applied = TextOverrideImportResultSchema.parse(await applyRes.json());
    expect(applied.appliedCount).toBe(2);

    const listRes = await req("/texts/overrides?locale=ar-AE", "GET", AX_ADMIN);
    const page = pageSchema(TextOverrideSchema).parse(await listRes.json());
    expect(page.items.find((o) => o.key === "common.save")?.message).toBe("تخزين");
    expect(page.items.find((o) => o.key === "term.learner")?.message).toBe("متدرب أول");
  });
});
