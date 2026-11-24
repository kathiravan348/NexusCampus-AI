import {
  CustomFieldDefinitionSchema,
  FormDefinitionSchema,
  NumberingFormatSchema,
  WorkflowDefinitionSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
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
