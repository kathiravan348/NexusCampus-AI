import {
  CoverageEntrySchema,
  LessonPlanSchema,
  OutcomeFrameworkSchema,
  OutcomeMappingSchema,
  OutcomeSchema,
  PAGE_SIZE_MAX,
  SyllabusCoverageSchema,
  SyllabusUnitSchema,
  pageSchema,
  type LessonPlan,
  type LessonPlanDeliveredInput,
  type LessonPlanReviewInput,
  type LessonPlanSubmitInput,
  type LessonPlanInput,
} from "@nexus/contracts";
import { useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery } from "../query";
import { useSession } from "../session";

const all = { pageSize: PAGE_SIZE_MAX };
const OutcomeFrameworkPage = pageSchema(OutcomeFrameworkSchema);
const OutcomePage = pageSchema(OutcomeSchema);
const OutcomeMappingPage = pageSchema(OutcomeMappingSchema);
const SyllabusUnitPage = pageSchema(SyllabusUnitSchema);
const LessonPlanPage = pageSchema(LessonPlanSchema);
const CoverageResponse = z.strictObject({
  coverage: SyllabusCoverageSchema,
  entries: z.array(CoverageEntrySchema),
});

export interface LessonPlanUpdateInput {
  readonly id: string;
  readonly input: LessonPlanInput;
}

export function useOutcomeFrameworks() {
  return useScopedQuery(queryKeys.m29.outcomeFrameworks, (c, signal) =>
    c.get("/outcome-frameworks", OutcomeFrameworkPage, all, { signal }),
  );
}

export function useOutcomes(frameworkId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m29.outcomes(s, frameworkId),
    (c, signal) => c.get("/outcomes", OutcomePage, { ...all, frameworkId }, { signal }),
  );
}

export function useOutcomeMappings(frameworkId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m29.outcomeMappings(s, frameworkId),
    (c, signal) =>
      c.get("/outcome-mappings", OutcomeMappingPage, { ...all, frameworkId }, { signal }),
  );
}

export function useSyllabusUnits(subjectId: string | null = null, enabled = true) {
  return useScopedQuery(
    (s) => queryKeys.m29.syllabusUnits(s, subjectId),
    (c, signal) => c.get("/syllabus-units", SyllabusUnitPage, { ...all, subjectId }, { signal }),
    enabled,
  );
}

export function useLessonPlans(subjectOfferingId: string | null = null, enabled = true) {
  return useScopedQuery(
    (s) => queryKeys.m29.lessonPlans(s, subjectOfferingId),
    (c, signal) =>
      c.get("/lesson-plans", LessonPlanPage, { ...all, subjectOfferingId }, { signal }),
    enabled,
  );
}

export function useSyllabusCoverage(subjectOfferingId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m29.syllabusCoverage(s, subjectOfferingId),
    (c, signal) => c.get("/syllabus-coverage", CoverageResponse, { subjectOfferingId }, { signal }),
    subjectOfferingId !== null,
  );
}

/** Creates a draft lesson plan via `POST /lesson-plans` (M29, L2 outbox write). */
export function useCreateLessonPlan() {
  const { session } = useSession();
  const qc = useQueryClient();

  return useOutboxMutation<LessonPlanInput, LessonPlan>({
    moduleId: "M29",
    operation: "lessonplan.create",
    mergeRule: "lww-audited",
    send: async (client, body, idempotencyKey) => {
      const plan = await client.send("POST", "/lesson-plans", body, LessonPlanSchema, {
        headers: idempotencyHeaders(idempotencyKey),
      });
      if (session) {
        const m29Prefix = queryKeys.m29.outcomeFrameworks(session).slice(0, -1);
        await qc.invalidateQueries({ queryKey: m29Prefix });
      }
      return plan;
    },
  });
}

/** Updates an editable draft or returned lesson plan via `PUT /lesson-plans/:id` (M29, L2). */
export function useUpdateLessonPlan() {
  const { session } = useSession();
  const qc = useQueryClient();

  return useOutboxMutation<LessonPlanUpdateInput, LessonPlan>({
    moduleId: "M29",
    operation: "lessonplan.update",
    mergeRule: "lww-audited",
    send: async (client, { id, input }, idempotencyKey) => {
      const plan = await client.send(
        "PUT",
        `/lesson-plans/${encodeURIComponent(id)}`,
        input,
        LessonPlanSchema,
        { headers: idempotencyHeaders(idempotencyKey) },
      );
      if (session) {
        const m29Prefix = queryKeys.m29.outcomeFrameworks(session).slice(0, -1);
        await qc.invalidateQueries({ queryKey: m29Prefix });
      }
      return plan;
    },
  });
}

function useLessonPlanAction<TInput>(action: "submit" | "review" | "delivered") {
  const { session } = useSession();
  const qc = useQueryClient();
  return useOutboxMutation<{ id: string; input: TInput }, LessonPlan>({
    moduleId: "M29",
    operation: `lessonplan.${action}`,
    mergeRule: "lww-audited",
    send: async (client, { id, input }, key) => {
      const plan = await client.send(
        "POST",
        `/lesson-plans/${encodeURIComponent(id)}/${action}`,
        input,
        LessonPlanSchema,
        { headers: idempotencyHeaders(key) },
      );
      if (session) {
        await qc.invalidateQueries({
          queryKey: queryKeys.m29.outcomeFrameworks(session).slice(0, -1),
        });
      }
      return plan;
    },
  });
}

export function useSubmitLessonPlan() {
  return useLessonPlanAction<LessonPlanSubmitInput>("submit");
}

export function useReviewLessonPlan() {
  return useLessonPlanAction<LessonPlanReviewInput>("review");
}

export function useMarkLessonPlanDelivered() {
  return useLessonPlanAction<LessonPlanDeliveredInput>("delivered");
}
