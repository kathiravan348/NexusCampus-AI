import type { LessonPlanInput } from "@nexus/contracts";
import {
  LESSON_PLAN,
  OFFERING,
  OUTCOME,
  PERSON,
  SYLLABUS_TOPIC,
  TENANT,
  USER,
  mockDb,
  resetMockDb,
} from "@nexus/mocks";
import { listOutbox } from "@nexus/offline";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  useCreateLessonPlan,
  useLessonPlans,
  useSubmitLessonPlan,
  useMarkLessonPlanDelivered,
  useReviewLessonPlan,
  useOutcomeFrameworks,
  useOutcomeMappings,
  useOutcomes,
  useSyllabusCoverage,
  useSyllabusUnits,
  useUpdateLessonPlan,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();
afterEach(() => {
  vi.restoreAllMocks();
  resetMockDb();
});

function tomDraft(overrides: Partial<LessonPlanInput> = {}): LessonPlanInput {
  const staffId = mockDb.roleProfiles.find(
    (row) => row.personId === PERSON.rvTom && row.kind === "staff",
  )!.id;
  return {
    subjectOfferingId: OFFERING.rvNorthYearNine[0],
    staffProfileId: staffId,
    date: "2026-10-08",
    timetableSlotId: null,
    title: "Argument Outline",
    topicIds: [SYLLABUS_TOPIC.rvEng3],
    outcomeIds: [OUTCOME.rvEngWrite],
    objectives: "Structure an argument with evidence.",
    activities: [{ order: 1, title: "Model outline", minutes: 15, kind: "instruction" }],
    resources: "Outline sheet",
    source: "manual",
    ...overrides,
  };
}

describe("M29 hooks", () => {
  it("loads curriculum, lesson plans and computed coverage through their schemas", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvHelen });
    const { result } = renderHook(
      () => {
        const frameworks = useOutcomeFrameworks();
        const frameworkId = frameworks.data?.items[0]?.id ?? null;
        const outcomes = useOutcomes(frameworkId);
        const units = useSyllabusUnits();
        const plans = useLessonPlans();
        const offeringId = plans.data?.items[0]?.subjectOfferingId ?? null;
        const coverage = useSyllabusCoverage(offeringId);
        return {
          frameworks,
          outcomes,
          mappings: useOutcomeMappings(frameworkId),
          units,
          plans,
          coverage,
        };
      },
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      const { frameworks, outcomes, mappings, units, plans, coverage } = result.current;
      expect(frameworks.data?.total).toBe(1);
      expect(outcomes.data?.total).toBe(6);
      expect(mappings.data?.total).toBe(0);
      expect(units.data?.total).toBe(4);
      expect(plans.data?.total).toBe(5);
      expect(coverage.data?.coverage).toMatchObject({
        topicsTotal: 2,
        topicsCovered: 1,
        percentBps: 5000,
      });
      expect(coverage.data?.entries).toHaveLength(2);
    });
  });

  it("creates and updates lesson plans online and invalidates M29 queries", async () => {
    signInAs({ ...ADMIN, tenantId: TENANT.riverside, userId: USER.rvTom });
    const { result } = renderHook(
      () => ({
        plans: useLessonPlans(OFFERING.rvNorthYearNine[0]),
        create: useCreateLessonPlan(),
        update: useUpdateLessonPlan(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => expect(result.current.plans.data?.total).toBe(1));

    let createdId = "";
    await act(async () => {
      const res = await result.current.create.mutateAsync(tomDraft());
      expect(res.queued).toBe(false);
      if (!res.queued) createdId = res.data.id;
    });

    await waitFor(() => expect(result.current.plans.data?.total).toBe(2));

    await act(async () => {
      const res = await result.current.update.mutateAsync({
        id: LESSON_PLAN.rvReturned,
        input: tomDraft({
          title: "Evidence Paragraphs v2",
          topicIds: [SYLLABUS_TOPIC.rvEng4],
        }),
      });
      expect(res.queued).toBe(false);
    });

    await waitFor(() => {
      const titles = (result.current.plans.data?.items ?? []).map((row) => row.title);
      expect(titles).toContain("Argument Outline");
      expect(titles).toContain("Evidence Paragraphs v2");
      expect(createdId).toMatch(/^lpl-/);
    });
  });

  it("queues a lesson plan create offline and syncs when back online", async () => {
    const scope = { tenantId: TENANT.riverside, userId: USER.rvTom };
    signInAs({ ...ADMIN, ...scope });
    const onlineSpy = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const db = freshDb();
    const { result } = renderHook(
      () => ({
        plans: useLessonPlans(OFFERING.rvNorthYearNine[0]),
        create: useCreateLessonPlan(),
      }),
      { wrapper: wrapper({ db }) },
    );

    await act(async () => {
      const outcome = await result.current.create.mutateAsync(
        tomDraft({ title: "Offline Queued Lesson" }),
      );
      expect(outcome.queued).toBe(true);
    });

    const queued = await listOutbox(db, scope);
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      moduleId: "M29",
      operation: "lessonplan.create",
      mergeRule: "lww-audited",
    });

    onlineSpy.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(async () => expect(await listOutbox(db, scope)).toHaveLength(0));
    await waitFor(() => {
      const titles = (result.current.plans.data?.items ?? []).map((row) => row.title);
      expect(titles).toContain("Offline Queued Lesson");
    });
  });
});

it.each(["submit", "review", "delivered"] as const)(
  "queues %s and applies it on reconnect",
  async (action) => {
    const userId = action === "review" ? USER.rvHelen : USER.rvTom;
    const scope = { tenantId: TENANT.riverside, userId };
    signInAs({ ...ADMIN, ...scope });
    const online = vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);
    const db = freshDb();
    const id = action === "review" ? LESSON_PLAN.rvSubmitted : LESSON_PLAN.rvReturned;
    const initial = mockDb.lessonPlans.find((row) => row.id === id)!;
    const initialStatus = action === "delivered" ? "approved" : initial.status;
    mockDb.lessonPlans[mockDb.lessonPlans.indexOf(initial)] = { ...initial, status: initialStatus };
    const { result } = renderHook(
      () => ({
        submit: useSubmitLessonPlan(),
        review: useReviewLessonPlan(),
        delivered: useMarkLessonPlanDelivered(),
        plans: useLessonPlans(initial.subjectOfferingId),
        coverage: useSyllabusCoverage(initial.subjectOfferingId),
      }),
      { wrapper: wrapper({ db }) },
    );
    const deliveredOn = "2026-01-01";
    await act(async () => {
      const outcome =
        action === "submit"
          ? await result.current.submit.mutateAsync({ id, input: {} })
          : action === "review"
            ? await result.current.review.mutateAsync({
                id,
                input: { decision: "approve", note: null },
              })
            : await result.current.delivered.mutateAsync({ id, input: { deliveredOn } });
      expect(outcome.queued).toBe(true);
    });
    expect(mockDb.lessonPlans.find((row) => row.id === id)?.status).toBe(initialStatus);
    expect(await listOutbox(db, scope)).toMatchObject([
      {
        moduleId: "M29",
        operation: `lessonplan.${action}`,
        mergeRule: "lww-audited",
        idempotencyKey: expect.any(String),
        payload: { id },
      },
    ]);
    online.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    const expected = { submit: "submitted", review: "approved", delivered: "delivered" };
    await waitFor(async () => expect(await listOutbox(db, scope)).toHaveLength(0));
    await waitFor(() => {
      const plan = result.current.plans.data?.items.find((row) => row.id === id);
      expect(plan?.status).toBe(expected[action]);
      if (action === "delivered") {
        for (const topicId of initial.topicIds) {
          expect(
            result.current.coverage.data?.entries.find((row) => row.topicId === topicId),
          ).toMatchObject({ status: "covered", coveredOn: deliveredOn, lessonPlanId: id });
        }
      }
    });
  },
);
