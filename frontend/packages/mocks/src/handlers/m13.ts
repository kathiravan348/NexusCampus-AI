import {
  EnrolmentSchema,
  LearnerDocumentSchema,
  LearnerSchema,
  pageSchema,
  type Learner,
} from "@nexus/contracts";
import { ApiFailure, familyOf, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { found, get, list, ok, type RouteContext } from "./route";

const M = { module: "M13" } as const;
const READ = "m13.learner.read";
const READ_RESTRICTED = "m13.learner.read_restricted";

function learnerAccess(viewer: Viewer) {
  const learners = ofTenant(mockDb.learners, viewer.tenantId);
  const family = familyOf(viewer);
  if (viewer.permissions.has(READ)) return { learners, family };

  const visible = learners.filter((learner) => family.has(learner.personId));
  if (visible.length === 0) throw new ApiFailure("forbidden");
  return { learners: visible, family };
}

function maskLearner(learner: Learner, viewer: Viewer, family: ReadonlySet<string>): Learner {
  if (viewer.permissions.has(READ_RESTRICTED) || family.has(learner.personId)) return learner;

  const sensitive = new Set(
    ofTenant(mockDb.customFieldDefinitions, viewer.tenantId)
      .filter((field) => field.entity === "learner" && field.sensitive)
      .map((field) => field.key),
  );
  return {
    ...learner,
    healthFlags: [],
    customFields: Object.fromEntries(
      Object.entries(learner.customFields).filter(([key]) => !sensitive.has(key)),
    ),
  };
}

function findLearner(ctx: RouteContext, learners: readonly Learner[]): Learner {
  return found(learners.find((learner) => learner.id === ctx.params["id"]));
}

export const m13Handlers = [
  get("/learners", M, (ctx) => {
    const { learners, family } = learnerAccess(ctx.viewer);
    return list(
      ctx,
      learners.map((learner) => maskLearner(learner, ctx.viewer, family)),
      pageSchema(LearnerSchema),
    );
  }),
  get("/learners/:id", M, (ctx) => {
    const { learners, family } = learnerAccess(ctx.viewer);
    return ok(LearnerSchema, maskLearner(findLearner(ctx, learners), ctx.viewer, family));
  }),
  get("/learners/:id/enrolments", M, (ctx) => {
    const learner = findLearner(ctx, learnerAccess(ctx.viewer).learners);
    const enrolments = ofTenant(mockDb.enrolments, ctx.viewer.tenantId);
    return list(
      ctx,
      enrolments.filter((row) => row.learnerId === learner.id),
      pageSchema(EnrolmentSchema),
    );
  }),
  get("/learners/:id/documents", M, (ctx) => {
    const learner = findLearner(ctx, learnerAccess(ctx.viewer).learners);
    const documents = ofTenant(mockDb.learnerDocuments, ctx.viewer.tenantId);
    return list(
      ctx,
      documents.filter((row) => row.learnerId === learner.id),
      pageSchema(LearnerDocumentSchema),
    );
  }),
];
