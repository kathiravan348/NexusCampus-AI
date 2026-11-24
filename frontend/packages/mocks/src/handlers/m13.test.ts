import {
  EnrolmentSchema,
  LearnerDocumentSchema,
  LearnerSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { LEARNER, LEARNER_FIELD, TENANT, USER } from "../fixtures";
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

const kavyaPath = `/learners/${LEARNER.lsKavya}`;
const rohanPath = `/learners/${LEARNER.lsRohan}`;
const LearnerPage = pageSchema(LearnerSchema);

describe("M13 read handlers", () => {
  it("lets admins read learners, enrolments and documents in their tenant", async () => {
    const response = await get("/learners");
    expect(response.status).toBe(200);
    const { items } = LearnerPage.parse(await response.json());
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((item) => item.tenantId === TENANT.littleSteps)).toBe(true);

    const detail = await get(kavyaPath);
    expect(detail.status).toBe(200);
    const learner = LearnerSchema.parse(await detail.json());
    expect(learner.id).toBe(LEARNER.lsKavya);
    expect(learner.healthFlags).toHaveLength(1);

    const enrolments = await get(`${kavyaPath}/enrolments`);
    expect(enrolments.status).toBe(200);
    expect(pageSchema(EnrolmentSchema).parse(await enrolments.json()).items).toMatchObject([
      { tenantId: TENANT.littleSteps, learnerId: LEARNER.lsKavya },
    ]);

    const documents = await get(`${kavyaPath}/documents`);
    expect(documents.status).toBe(200);
    expect(pageSchema(LearnerDocumentSchema).parse(await documents.json()).items).toMatchObject([
      { tenantId: TENANT.littleSteps, learnerId: LEARNER.lsKavya },
    ]);
  });

  it("masks restricted learner fields from teachers except for their own family", async () => {
    const kavya = mockDb.learners.find((row) => row.id === LEARNER.lsKavya)!;
    const rohan = mockDb.learners.find((row) => row.id === LEARNER.lsRohan)!;
    rohan.healthFlags = [...kavya.healthFlags];
    rohan.customFields[LEARNER_FIELD.supportNote] = "Example support note";
    kavya.customFields[LEARNER_FIELD.supportNote] = "Example family support note";

    const response = await get("/learners", USER.lsArjun);
    expect(response.status).toBe(200);
    const { items } = LearnerPage.parse(await response.json());
    expect(items).toHaveLength(4);
    const masked = items.find((row) => row.id === rohan.id);
    expect(masked?.healthFlags).toEqual([]);
    expect(masked?.customFields).toEqual({
      [LEARNER_FIELD.studyInterest]: rohan.customFields[LEARNER_FIELD.studyInterest],
    });
    expect(items.find((row) => row.id === kavya.id)).toEqual(kavya);

    const detail = await get(rohanPath, USER.lsArjun);
    expect(detail.status).toBe(200);
    expect(LearnerSchema.parse(await detail.json())).toEqual(masked);

    const familyDetail = await get(rohanPath, USER.lsSunita);
    expect(familyDetail.status).toBe(200);
    expect(LearnerSchema.parse(await familyDetail.json())).toEqual(rohan);
  });

  it("scopes guardians to their own children and refuses access for an unlinked viewer", async () => {
    const response = await get("/learners", USER.lsSunita);
    expect(response.status).toBe(200);
    const { items } = LearnerPage.parse(await response.json());
    expect(items.map((row) => row.id).sort()).toEqual([LEARNER.lsIshaan, LEARNER.lsRohan]);
    for (const suffix of ["", "/enrolments", "/documents"]) {
      expect((await get(`${kavyaPath}${suffix}`, USER.lsSunita)).status).toBe(404);
    }

    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/learners")).status).toBe(403);
  });

  it.each(["", "/enrolments", "/documents"])(
    "returns 404 for a foreign learner at %s",
    async (suffix) => {
      expect((await get(`/learners/${LEARNER.rvOliver}${suffix}`)).status).toBe(404);
    },
  );
});
