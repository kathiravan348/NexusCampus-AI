import {
  AssessmentSchema,
  AttendanceRosterEntrySchema,
  GradingSchemeSchema,
  MarkEntrySchema,
  RubricSchema,
  pageSchema,
} from "@nexus/contracts";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { MOCK_HEADER } from "../context";
import { mockDb, resetMockDb } from "../db";
import { ASSESSMENT, CLASS_GROUP, LEARNER, TENANT, USER } from "../fixtures";
import { server } from "../node";

function get(path: string, user: string = USER.lsPriya, tenant: string = TENANT.littleSteps) {
  return fetch(`http://localhost/api/v1${path}`, {
    headers: { [MOCK_HEADER.tenant]: tenant, [MOCK_HEADER.user]: user },
  });
}

function putMark(
  path: string,
  body: unknown,
  key = crypto.randomUUID(),
  user: string = USER.lsArjun,
  tenant: string = TENANT.littleSteps,
) {
  return fetch(`http://localhost/api/v1${path}`, {
    method: "PUT",
    headers: {
      [MOCK_HEADER.tenant]: tenant,
      [MOCK_HEADER.user]: user,
      "Content-Type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify(body),
  });
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  resetMockDb();
});
afterAll(() => server.close());

const marksPath = (id: string) => `/assessments/${id}/marks`;
const rosterPath = (id: string) => `/assessments/${id}/roster`;
const RosterPage = pageSchema(AttendanceRosterEntrySchema);

describe("M20 read handlers", () => {
  it("lists tenant-local records for admins", async () => {
    const endpoints = [
      ["/grading-schemes", pageSchema(GradingSchemeSchema)],
      ["/assessments", pageSchema(AssessmentSchema)],
      ["/rubrics", pageSchema(RubricSchema)],
      [marksPath(ASSESSMENT.ls[0]), pageSchema(MarkEntrySchema)],
    ] as const;
    for (const [path, schema] of endpoints) {
      const response = await get(path);
      expect(response.status).toBe(200);
      const { items } = schema.parse(await response.json());
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((row) => row.tenantId === TENANT.littleSteps)).toBe(true);
    }
  });

  it("filters assessments by the offering's class group", async () => {
    const response = await get(`/assessments?classGroupId=${CLASS_GROUP.lsSeedlings}`);
    expect(response.status).toBe(200);
    expect(
      pageSchema(AssessmentSchema)
        .parse(await response.json())
        .items.map((row) => row.id),
    ).toEqual([ASSESSMENT.ls[0]]);
    expect((await get(`/assessments?classGroupId=${CLASS_GROUP.rvSouthYearFive}`)).status).toBe(
      404,
    );
  });

  it("lets teachers read marks and returns 404 for foreign assessments", async () => {
    const response = await get(marksPath(ASSESSMENT.ls[0]), USER.lsArjun);
    expect(response.status).toBe(200);
    expect(pageSchema(MarkEntrySchema).parse(await response.json()).items.length).toBeGreaterThan(
      0,
    );
    expect((await get(marksPath(ASSESSMENT.rv[0]))).status).toBe(404);
  });

  it("returns only a guardian's published family marks and removes remarks", async () => {
    const entry = mockDb.markEntries.find((row) => row.assessmentId === ASSESSMENT.ls[0])!;
    entry.learnerId = LEARNER.lsRohan;
    entry.remark = "Private example remark";
    mockDb.markEntries.push({ ...entry, learnerId: LEARNER.lsKavya });

    const response = await get(marksPath(ASSESSMENT.ls[0]), USER.lsSunita);
    expect(response.status).toBe(200);
    const { items } = pageSchema(MarkEntrySchema).parse(await response.json());
    expect(items).toEqual(expect.arrayContaining([{ ...entry, remark: null }]));
    expect(items.every((row) => row.remark === null)).toBe(true);
    expect(items.map((row) => row.learnerId)).not.toContain(LEARNER.lsKavya);
    expect((await get(marksPath(ASSESSMENT.ls[1]), USER.lsSunita)).status).toBe(404);
    expect((await get("/assessments", USER.lsSunita)).status).toBe(403);
  });

  it("denies an account without the read permission or family access", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.lsPriya);
    expect((await get("/grading-schemes")).status).toBe(403);
  });
});

describe("M20 roster and mark entry handlers", () => {
  it("returns effective-today roster, deduplicated and sorted before paging", async () => {
    const assessment = mockDb.assessments.find((row) => row.id === ASSESSMENT.ls[1])!;
    const offering = mockDb.subjectOfferings.find(
      (row) => row.id === assessment.subjectOfferingId,
    )!;
    const base = mockDb.enrolments.find((row) => row.tenantId === TENANT.littleSteps)!;
    const learners = mockDb.learners.filter((row) => row.tenantId === TENANT.littleSteps);
    const today = new Date().toISOString().slice(0, 10);
    const groupId = offering.classGroupId;
    const activeRows = [
      { ...base, learnerId: learners[0]!.id, classGroupId: groupId, rollNumber: "10" },
      { ...base, learnerId: learners[1]!.id, classGroupId: groupId, rollNumber: "2" },
      { ...base, learnerId: learners[2]!.id, classGroupId: groupId, rollNumber: null },
    ].map((row) => ({ ...row, effectiveFrom: today, effectiveTo: today }));
    mockDb.enrolments = [
      ...mockDb.enrolments.filter((row) => row.tenantId !== TENANT.littleSteps),
      ...activeRows,
      activeRows[0]!,
      { ...activeRows[0]!, rollNumber: "0", effectiveTo: "2000-01-01" },
      { ...activeRows[0]!, rollNumber: "0", effectiveFrom: "2099-01-01", effectiveTo: null },
    ];
    const page = RosterPage.parse(
      await (await get(`${rosterPath(assessment.id)}?pageSize=2&page=1`, USER.lsArjun)).json(),
    );
    expect(page.total).toBe(3);
    expect(page.items).toEqual([
      { learnerId: learners[1]!.id, rollNumber: "2" },
      { learnerId: learners[0]!.id, rollNumber: "10" },
    ]);
    const tail = RosterPage.parse(
      await (await get(`${rosterPath(assessment.id)}?pageSize=2&page=2`, USER.lsArjun)).json(),
    );
    expect(tail.items).toEqual([{ learnerId: learners[2]!.id, rollNumber: null }]);
    expect((await get(rosterPath(ASSESSMENT.rv[0]))).status).toBe(404);
    expect((await get(rosterPath(assessment.id), USER.lsSunita)).status).toBe(403);
  });

  it("upserts marks keeping existing id and replays idempotently per tenant", async () => {
    const assessment = mockDb.assessments.find((row) => row.id === ASSESSMENT.ls[1])!;
    const roster = RosterPage.parse(await (await get(rosterPath(assessment.id))).json());
    const learnerId = roster.items[0]!.learnerId;
    const existing = mockDb.markEntries.find(
      (row) => row.assessmentId === assessment.id && row.learnerId === learnerId,
    )!;
    const path = `${marksPath(assessment.id)}/${learnerId}`;
    const countBefore = mockDb.markEntries.length;
    const input = { marks: 44.5, absent: false, rubricScores: null, remark: "Clear work." };
    const key = crypto.randomUUID();
    const [first, second] = await Promise.all([
      putMark(path, input, key),
      putMark(path, input, key),
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    const saved = MarkEntrySchema.parse(await first.json());
    expect(await second.json()).toEqual(saved);
    expect(saved.id).toBe(existing.id);
    expect(saved).toMatchObject({
      ...input,
      tenantId: TENANT.littleSteps,
      assessmentId: assessment.id,
      learnerId,
      deviceId: null,
    });
    expect(saved.enteredByStaffProfileId).toBeTruthy();
    expect(mockDb.markEntries).toHaveLength(countBefore);

    // Creates a new entry when none existed yet.
    mockDb.markEntries = mockDb.markEntries.filter(
      (row) => !(row.assessmentId === assessment.id && row.learnerId === learnerId),
    );
    const createdRes = await putMark(path, { ...input, marks: 48 });
    expect(createdRes.status).toBe(200);
    const created = MarkEntrySchema.parse(await createdRes.json());
    expect(created.marks).toBe(48);

    // Replaying an earlier key after the assessment closes still returns the stored result.
    const replayKey = crypto.randomUUID();
    const beforeClose = MarkEntrySchema.parse(
      await (await putMark(path, { ...input, marks: 46 }, replayKey)).json(),
    );
    assessment.status = "published";
    const afterClose = await putMark(path, { ...input, marks: 10 }, replayKey);
    expect(afterClose.status).toBe(200);
    expect(await afterClose.json()).toEqual(beforeClose);
  });

  it("validates rubric scores against the assessment rubric", async () => {
    const withRubric = mockDb.assessments.find((row) => row.id === ASSESSMENT.ls[0])!;
    withRubric.status = "open";
    const roster = RosterPage.parse(await (await get(rosterPath(withRubric.id))).json());
    const path = `${marksPath(withRubric.id)}/${roster.items[0]!.learnerId}`;
    const entry = (
      marks: number | null,
      absent: boolean,
      rubricScores: Record<string, number> | null,
    ) => ({ marks, absent, rubricScores, remark: null });

    const valid = await putMark(path, entry(91.5, false, { UNDERSTANDING: 3, EXECUTION: 2 }));
    expect(valid.status).toBe(200);
    expect((await putMark(path, entry(null, true, null))).status).toBe(200);

    const badBodies = [
      entry(80, false, null),
      entry(80, false, { UNDERSTANDING: 3 }),
      entry(80, false, { UNDERSTANDING: 3, EXECUTION: 2, EXTRA: 1 }),
      entry(80, false, { UNDERSTANDING: 9, EXECUTION: 2 }),
      entry(null, true, { UNDERSTANDING: 2, EXECUTION: 2 }),
    ];
    for (const body of badBodies) {
      const res = await putMark(path, body);
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('"path":"rubricScores"');
    }

    const plain = mockDb.assessments.find((row) => row.id === ASSESSMENT.ls[1])!;
    const plainRoster = RosterPage.parse(await (await get(rosterPath(plain.id))).json());
    const plainPath = `${marksPath(plain.id)}/${plainRoster.items[0]!.learnerId}`;
    const extra = entry(25, false, { UNDERSTANDING: 2, EXECUTION: 2 });
    const unexpected = await putMark(plainPath, extra);
    expect(unexpected.status).toBe(400);
    expect(await unexpected.text()).toContain('"path":"rubricScores"');
  });

  it("enforces access, staff profile, status, roster and max without leaking values", async () => {
    const published = mockDb.assessments.find((row) => row.id === ASSESSMENT.ls[0])!;
    const open = mockDb.assessments.find((row) => row.id === ASSESSMENT.ls[1])!;
    const roster = RosterPage.parse(await (await get(rosterPath(open.id))).json());
    const learnerId = roster.items[0]!.learnerId;
    const openPath = `${marksPath(open.id)}/${learnerId}`;
    const validBody = { marks: 40, absent: false, rubricScores: null, remark: null };

    // Guardian denied on write.
    expect((await putMark(openPath, validBody, undefined, USER.lsSunita)).status).toBe(403);
    // Foreign assessment returns 404.
    const foreign = await putMark(`${marksPath(ASSESSMENT.rv[1])}/${learnerId}`, validBody);
    expect(foreign.status).toBe(404);
    // Published assessment returns 409 conflict with path status.
    const closed = await putMark(`${marksPath(published.id)}/${learnerId}`, validBody);
    expect(closed.status).toBe(409);
    expect(await closed.text()).toContain('"path":"status"');

    // Off-roster learner returns 400 path learnerId without echoing values.
    const offRosterId = "off-roster-secret-id";
    const privateRemark = "Confidential note text";
    const offRoster = await putMark(`${marksPath(open.id)}/${offRosterId}`, {
      ...validBody,
      remark: privateRemark,
    });
    expect(offRoster.status).toBe(400);
    const offRosterText = await offRoster.text();
    expect(offRosterText).toContain('"path":"learnerId"');
    expect(offRosterText).not.toContain(offRosterId);
    expect(offRosterText).not.toContain(privateRemark);

    // Marks above max returns 400 path marks without echoing the mark or remark.
    const overMax = await putMark(openPath, {
      marks: open.maxMarks + 0.5,
      absent: false,
      rubricScores: null,
      remark: privateRemark,
    });
    expect(overMax.status).toBe(400);
    const overMaxText = await overMax.text();
    expect(overMaxText).toContain('"path":"marks"');
    expect(overMaxText).not.toContain(String(open.maxMarks + 0.5));
    expect(overMaxText).not.toContain(privateRemark);

    // Requires an active, currently effective staff profile.
    const staffProfiles = mockDb.roleProfiles.filter(
      (row) => row.tenantId === TENANT.littleSteps && row.kind === "staff",
    );
    for (const profile of staffProfiles) profile.effectiveTo = "2000-01-01";
    expect((await putMark(openPath, validBody)).status).toBe(403);
    for (const profile of staffProfiles) profile.effectiveTo = null;

    // Missing m20.marks.enter permission returns 403.
    for (const role of mockDb.roles) {
      role.permissions = role.permissions.filter((code) => code !== "m20.marks.enter");
    }
    expect((await putMark(openPath, validBody)).status).toBe(403);
  });
});
