import {
  EnrolmentSchema,
  LearnerDocumentSchema,
  LearnerSchema,
  PAGE_SIZE_MAX,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const LearnerPage = pageSchema(LearnerSchema);
const EnrolmentPage = pageSchema(EnrolmentSchema);
const LearnerDocumentPage = pageSchema(LearnerDocumentSchema);

export function useLearners() {
  return useScopedQuery(queryKeys.m13.learners, (c, signal) =>
    c.get("/learners", LearnerPage, all, { signal }),
  );
}

export function useLearner(learnerId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m13.learner(s, learnerId),
    (c, signal) =>
      c.get(`/learners/${encodeURIComponent(learnerId ?? "")}`, LearnerSchema, undefined, {
        signal,
      }),
    learnerId !== null,
  );
}

export function useLearnerEnrolments(learnerId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m13.learnerEnrolments(s, learnerId),
    (c, signal) =>
      c.get(`/learners/${encodeURIComponent(learnerId ?? "")}/enrolments`, EnrolmentPage, all, {
        signal,
      }),
    learnerId !== null,
  );
}

export function useLearnerDocuments(learnerId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m13.learnerDocuments(s, learnerId),
    (c, signal) =>
      c.get(
        `/learners/${encodeURIComponent(learnerId ?? "")}/documents`,
        LearnerDocumentPage,
        all,
        { signal },
      ),
    learnerId !== null,
  );
}
