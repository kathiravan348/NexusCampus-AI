import {
  DaySummarySchema,
  DiaryEntrySchema,
  IsoDateSchema,
  MilestoneProgressSchema,
  ObservationSchema,
  PickupCheckSchema,
  RatioSnapshotSchema,
  pageSchema,
} from "@nexus/contracts";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { get, list, param } from "./route";

const DIARY = { module: "M37", permission: "m37.diary.read" } as const;
const PICKUP = { module: "M37", permission: "m37.pickup.check" } as const;

/** Learner IDs the viewer owns as a guardian (via M14 links) or as a learner themselves. */
export function ownLearnerIds(viewer: Viewer): Set<string> {
  const personIds = new Set<string>([viewer.personId]);
  for (const rel of ofTenant(mockDb.guardianRelationships, viewer.tenantId)) {
    if (rel.guardianPersonId === viewer.personId) {
      personIds.add(rel.learnerPersonId);
    }
  }
  return new Set(
    ofTenant(mockDb.learners, viewer.tenantId)
      .filter((learner) => personIds.has(learner.personId))
      .map((learner) => learner.id),
  );
}

function dateParam(url: URL): string | null {
  const value = param(url, "date");
  if (value === null) return null;
  const parsed = IsoDateSchema.safeParse(value);
  if (!parsed.success) {
    throw new ApiFailure("invalid_request", [{ path: "date", message: "must be YYYY-MM-DD" }]);
  }
  return parsed.data;
}

function m37Scope(viewer: Viewer) {
  const isStaff =
    viewer.permissions.has("m37.diary.record") || viewer.permissions.has("m37.pickup.check");
  const learnerIds = isStaff
    ? new Set(ofTenant(mockDb.learners, viewer.tenantId).map((row) => row.id))
    : ownLearnerIds(viewer);
  const checkLearner = (id: string) => {
    if (!learnerIds.has(id)) throw new ApiFailure("not_found");
  };
  return { isStaff, learnerIds, checkLearner };
}

export const m37Handlers = [
  get("/diary-entries", DIARY, (ctx) => {
    const { isStaff, learnerIds, checkLearner } = m37Scope(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const date = dateParam(ctx.url);
    const rows = ofTenant(mockDb.diaryEntries, ctx.viewer.tenantId).filter(
      (row) =>
        learnerIds.has(row.learnerId) &&
        (isStaff || row.sharedWithFamily) &&
        (learnerId === null || row.learnerId === learnerId) &&
        (date === null || row.date === date),
    );
    return list(ctx, rows, pageSchema(DiaryEntrySchema));
  }),
  get("/observations", DIARY, (ctx) => {
    const { isStaff, learnerIds, checkLearner } = m37Scope(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const rows = ofTenant(mockDb.observations, ctx.viewer.tenantId)
      .filter(
        (row) =>
          (isStaff || row.sharedWithFamily) &&
          row.learnerIds.some((id) => learnerIds.has(id)) &&
          (learnerId === null || row.learnerIds.includes(learnerId)),
      )
      .map((row) =>
        isStaff ? row : { ...row, learnerIds: row.learnerIds.filter((id) => learnerIds.has(id)) },
      );
    return list(ctx, rows, pageSchema(ObservationSchema));
  }),
  get("/milestone-progress", DIARY, (ctx) => {
    const { learnerIds, checkLearner } = m37Scope(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const rows = ofTenant(mockDb.milestoneProgress, ctx.viewer.tenantId).filter(
      (row) => learnerIds.has(row.learnerId) && (learnerId === null || row.learnerId === learnerId),
    );
    return list(ctx, rows, pageSchema(MilestoneProgressSchema));
  }),
  get("/day-summaries", DIARY, (ctx) => {
    const { isStaff, learnerIds, checkLearner } = m37Scope(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const rows = ofTenant(mockDb.daySummaries, ctx.viewer.tenantId).filter(
      (row) =>
        learnerIds.has(row.learnerId) &&
        (isStaff || row.status === "sent") &&
        (learnerId === null || row.learnerId === learnerId),
    );
    return list(ctx, rows, pageSchema(DaySummarySchema));
  }),
  get("/pickup-checks", PICKUP, (ctx) => {
    const tenantLearnerIds = new Set(
      ofTenant(mockDb.learners, ctx.viewer.tenantId).map((row) => row.id),
    );
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null && !tenantLearnerIds.has(learnerId)) {
      throw new ApiFailure("not_found");
    }
    const date = dateParam(ctx.url);
    const rows = ofTenant(mockDb.pickupChecks, ctx.viewer.tenantId).filter(
      (row) =>
        (learnerId === null || row.learnerId === learnerId) && (date === null || row.date === date),
    );
    return list(ctx, rows, pageSchema(PickupCheckSchema));
  }),
  get("/ratio-snapshots", PICKUP, (ctx) => {
    const rows = ofTenant(mockDb.ratioSnapshots, ctx.viewer.tenantId);
    return list(ctx, rows, pageSchema(RatioSnapshotSchema));
  }),
];
