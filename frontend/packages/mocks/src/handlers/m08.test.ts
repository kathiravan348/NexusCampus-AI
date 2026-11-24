import {
  CustomFieldDefinitionSchema,
  FormDefinitionSchema,
  NumberingFormatSchema,
  WorkflowDefinitionSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { TENANT, USER } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.lsPriya) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: TENANT.littleSteps, [MOCK_HEADER.user]: user },
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M08 read handlers", () => {
  it.each([
    ["/custom-fields?entity=learner", pageSchema(CustomFieldDefinitionSchema)],
    ["/forms", pageSchema(FormDefinitionSchema)],
    ["/workflows", pageSchema(WorkflowDefinitionSchema)],
    ["/numbering-formats", pageSchema(NumberingFormatSchema)],
  ] as const)("lists only the admin's tenant at %s", async (path, schema) => {
    const response = await get(path);
    expect(response.status).toBe(200);
    const { items } = schema.parse(await response.json());
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.tenantId === TENANT.littleSteps)).toBe(true);
  });

  it("filters custom fields by entity for teachers", async () => {
    const response = await get("/custom-fields?entity=staff", USER.lsArjun);
    expect(response.status).toBe(200);
    expect(pageSchema(CustomFieldDefinitionSchema).parse(await response.json()).total).toBe(0);
    expect((await get("/custom-fields?entity=unknown")).status).toBe(400);
  });

  it.each(["/custom-fields", "/forms", "/workflows", "/numbering-formats"])(
    "requires config read permission at %s",
    async (path) => {
      expect((await get(path, USER.lsSunita)).status).toBe(403);
    },
  );
});

describe("POST /custom-fields", () => {
  const tenantId = TENANT.littleSteps;
  function input() {
    const locale = mockDb.institutions.find((row) => row.tenantId === tenantId)!.locale
      .defaultLocale;
    return {
      entity: "learner",
      key: "testChoice",
      type: "choice",
      label: { [locale]: "Selection" },
      required: false,
      sensitive: true,
      order: 7,
      options: ["first", "second"].map((value) => ({ value, label: { [locale]: value } })),
    };
  }

  function post(body: unknown, user: string = USER.lsPriya) {
    return fetch("http://localhost/api/v1/custom-fields", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [MOCK_HEADER.tenant]: tenantId,
        [MOCK_HEADER.user]: user,
      },
      body: JSON.stringify(body),
    });
  }

  it("creates a field, scopes uniqueness to its tenant and entity, and preserves archived keys", async () => {
    const body = input();
    const response = await post(body);
    expect(response.status).toBe(201);
    const field = CustomFieldDefinitionSchema.parse(await response.json());
    expect(field).toMatchObject({ ...body, tenantId, archived: false });
    const stored = mockDb.customFieldDefinitions.find((row) => row.id === field.id)!;
    stored.archived = true;
    expect((await post(body)).status).toBe(409);
    expect((await post({ ...body, entity: "staff" })).status).toBe(201);
    stored.tenantId = TENANT.riverside;
    expect((await post(body)).status).toBe(201);
  });

  it("requires a default-locale label and returns a safe field path", async () => {
    const initialCount = mockDb.customFieldDefinitions.length;
    const response = await post({ ...input(), label: { fr: "Private label" } });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body).toMatchObject({
      error: { code: "invalid_request", details: [{ path: "label" }] },
    });
    expect(JSON.stringify(body)).not.toContain("Private label");
    expect(mockDb.customFieldDefinitions).toHaveLength(initialCount);
  });

  it("blocks read-only viewers and rejects attempts to assign server-owned fields", async () => {
    const count = mockDb.customFieldDefinitions.length;
    expect((await post(input(), USER.lsArjun)).status).toBe(403);
    expect((await post({ ...input(), tenantId: TENANT.riverside })).status).toBe(400);
    expect(mockDb.customFieldDefinitions).toHaveLength(count);
  });
});
