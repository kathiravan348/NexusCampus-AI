import {
  CredentialTemplateSchema,
  CredentialVerificationSchema,
  IssuedCredentialSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { ISSUED_CREDENTIAL, LEARNER, TENANT, USER, VERIFICATION_CODE, roleId } from "../fixtures";
import { server } from "../node";

const rv = TENANT.riverside;
const nb = TENANT.northbridge;
const mia = `/issued-credentials/${ISSUED_CREDENTIAL.rvMiaBadge}`;
const oliver = `/issued-credentials/${ISSUED_CREDENTIAL.rvOliverExpired}`;
const credentialPage = pageSchema(IssuedCredentialSchema);
const routes = ["/credential-templates", "/issued-credentials", mia];

function get(path: string, userId: string = USER.rvHelen, tenantId: string = rv) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenantId, [MOCK_HEADER.user]: userId },
  });
}

function verify(code: string) {
  return fetch(`http://localhost/api/v1/credential-verifications/${encodeURIComponent(code)}`);
}

async function readBody(response: Response, status = 200): Promise<unknown> {
  expect(response.status).toBe(status);
  return response.json();
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

describe("M45 read handlers", () => {
  it("serves tenant templates, issued credentials and details to an admin", async () => {
    const templates = pageSchema(CredentialTemplateSchema).parse(
      await readBody(await get("/credential-templates")),
    );
    const tenantTemplates = mockDb.credentialTemplates.filter((row) => row.tenantId === rv);
    expect(templates.items).toEqual(tenantTemplates);

    const rows = credentialPage.parse(await readBody(await get("/issued-credentials")));
    expect(rows.items).toEqual(mockDb.issuedCredentials.filter((row) => row.tenantId === rv));
    const detail = IssuedCredentialSchema.parse(await readBody(await get(mia)));
    expect(detail.id).toBe(ISSUED_CREDENTIAL.rvMiaBadge);
    expect(detail.proof).not.toBeNull();
    expect(Object.keys(detail.proof!).sort()).toEqual(["created", "type", "verificationMethod"]);

    const foreign = `/issued-credentials/${ISSUED_CREDENTIAL.nbJordanRevoked}`;
    expect(await readBody(await get(foreign), 404)).toEqual({
      error: { code: "not_found", message: "Not found." },
    });
  });

  it("lets learners see their own hidden credential", async () => {
    const learner = mockDb.learners.find((row) => row.id === LEARNER.nbAiden)!;
    mockDb.users = mockDb.users.map((row) =>
      row.id === USER.nbJordan ? { ...row, personId: learner.personId } : row,
    );
    const id = ISSUED_CREDENTIAL.nbAidenHidden;
    const rows = credentialPage.parse(
      await readBody(await get("/issued-credentials", USER.nbJordan, nb)),
    );
    expect(rows.items.map((row) => row.id)).toEqual([id]);
    const detail = IssuedCredentialSchema.parse(
      await readBody(await get(`/issued-credentials/${id}`, USER.nbJordan, nb)),
    );
    expect(detail.id).toBe(id);
    await readBody(
      await get(`/issued-credentials/${ISSUED_CREDENTIAL.nbJordanRevoked}`, USER.nbJordan, nb),
      404,
    );
  });

  it("allows guardians to see their linked minor's visible credentials only", async () => {
    const learner = mockDb.learners.find((row) => row.id === LEARNER.rvMia)!;
    const child = mockDb.people.find((row) => row.id === learner.personId)!;
    const link = mockDb.guardianLinks.find(
      (row) => row.tenantId === rv && row.learnerPersonId === child.id,
    )!;
    const guardian = mockDb.users.find(
      (row) => row.tenantId === rv && row.personId === link.guardianPersonId,
    )!;
    mockDb.guardianLinks = mockDb.guardianLinks.filter(
      (row) =>
        row.tenantId !== rv ||
        row.guardianPersonId !== guardian.personId ||
        row.learnerPersonId === child.id,
    );
    const listCredentials = async () =>
      credentialPage.parse(await readBody(await get("/issued-credentials", guardian.id)));
    expect((await listCredentials()).items.map((row) => row.id)).toEqual([
      ISSUED_CREDENTIAL.rvMiaBadge,
    ]);
    await readBody(await get(mia, guardian.id));
    await readBody(await get(oliver, guardian.id), 404);

    mockDb.hiddenCredentialIds.push(ISSUED_CREDENTIAL.rvMiaBadge);
    expect((await listCredentials()).items).toEqual([]);
    await readBody(await get(mia, guardian.id), 404);

    mockDb.hiddenCredentialIds = [];
    mockDb.people = mockDb.people.map((row) =>
      row.id === child.id ? { ...row, isMinor: false } : row,
    );
    expect((await listCredentials()).items).toEqual([]);
    await readBody(await get(mia, guardian.id), 404);
  });

  it("gives staff without the issue grant no issued credentials outside their family", async () => {
    const assignment = mockDb.roleAssignments.find((row) => row.roleId === roleId(rv, "teacher"))!;
    const teacher = mockDb.users.find((row) => row.id === assignment.userId)!;
    mockDb.guardianLinks = mockDb.guardianLinks.filter(
      (row) => row.guardianPersonId !== teacher.personId,
    );
    const rows = credentialPage.parse(await readBody(await get("/issued-credentials", teacher.id)));
    expect(rows).toMatchObject({ items: [], total: 0 });
    await readBody(await get(mia, teacher.id), 404);
  });

  it("enforces credential grants and entitlement on authenticated endpoints", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    for (const path of routes) {
      expect(await readBody(await get(path), 403)).toMatchObject({
        error: { code: "forbidden" },
      });
    }

    resetMockDb();
    mockDb.entitlements = mockDb.entitlements.filter(
      (row) => row.tenantId !== rv || row.moduleId !== "M45",
    );
    for (const path of routes) {
      expect(await readBody(await get(path), 403)).toMatchObject({
        error: { code: "module_disabled" },
      });
    }
  });

  it("serves public verification without session headers or learner data", async () => {
    const cases = [
      [VERIFICATION_CODE.rvMiaBadge, "valid"],
      [VERIFICATION_CODE.rvOliverExpired, "expired"],
      [VERIFICATION_CODE.nbJordanRevoked, "revoked"],
      [VERIFICATION_CODE.unknown, "not_found"],
      [VERIFICATION_CODE.nbAidenHidden, "not_found"],
      ["unrecognised-code", "not_found"],
      ["!".repeat(65), "not_found"],
    ] as const;
    for (const [code, result] of cases) {
      const row = CredentialVerificationSchema.parse(await readBody(await verify(code)));
      expect(row).toEqual({
        verificationCode: code.slice(0, 64),
        result,
        kind: result === "not_found" ? null : expect.any(String),
        credentialName: result === "not_found" ? null : expect.any(String),
        institutionName: result === "not_found" ? null : expect.any(String),
        issuedOn: result === "not_found" ? null : expect.any(String),
        expiresOn: result === "revoked" || result === "expired" ? expect.any(String) : null,
      });
    }
  });
});
