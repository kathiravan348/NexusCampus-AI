import {
  EngagementSnapshotSchema,
  InterventionSchema,
  RiskLevelSchema,
  RiskScoreSchema,
  pageSchema,
  type CourseSpace,
  type RiskScore,
} from "@nexus/contracts";
import { ApiFailure, ofTenant, type Viewer } from "../context";
import { mockDb } from "../db";
import { DEMO_NOW } from "../fixtures/compliance";
import { found, get, list, ok, param } from "./route";

const M = { module: "M46", permission: "m46.risk.read" } as const;
const DEMO_NOW_MS = Date.parse(DEMO_NOW);

function isActiveRiskScore(row: RiskScore): boolean {
  return Date.parse(row.validUntil) >= DEMO_NOW_MS;
}

function learnersOfSpaces(tenantId: string, spaces: readonly CourseSpace[]): Set<string> {
  const ids = new Set<string>();
  const enrolments = ofTenant(mockDb.enrolments, tenantId);
  for (const space of spaces) {
    for (const row of enrolments) {
      if (
        row.classGroupId !== null &&
        space.classGroupIds.includes(row.classGroupId) &&
        (space.academicYearId === null || row.academicYearId === space.academicYearId)
      ) {
        ids.add(row.learnerId);
      }
    }
  }
  return ids;
}

function m46Access(viewer: Viewer) {
  const { tenantId, personId, permissions } = viewer;
  const all = permissions.has("m46.intervention.manage");
  const staffIds = new Set(
    ofTenant(mockDb.roleProfiles, tenantId)
      .filter((row) => row.kind === "staff" && row.personId === personId)
      .map((row) => row.id),
  );
  const spaces = ofTenant(mockDb.courseSpaces, tenantId).filter(
    (space) => all || space.staffProfileIds.some((id) => staffIds.has(id)),
  );
  const learnerIds = all
    ? new Set(ofTenant(mockDb.learners, tenantId).map((row) => row.id))
    : learnersOfSpaces(tenantId, spaces);
  const checkLearner = (id: string) => {
    if (!learnerIds.has(id)) throw new ApiFailure("not_found");
  };
  return { learnerIds, checkLearner };
}

export const m46Handlers = [
  get("/engagement", M, (ctx) => {
    const { learnerIds, checkLearner } = m46Access(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const rows = ofTenant(mockDb.engagementSnapshots, ctx.viewer.tenantId).filter(
      (r) => learnerIds.has(r.learnerId) && (learnerId === null || r.learnerId === learnerId),
    );
    return list(ctx, rows, pageSchema(EngagementSnapshotSchema));
  }),
  get("/risk-scores", M, (ctx) => {
    const { learnerIds, checkLearner } = m46Access(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const levelParam = param(ctx.url, "level");
    const parsedLevel = levelParam === null ? null : RiskLevelSchema.safeParse(levelParam);
    if (parsedLevel !== null && !parsedLevel.success) {
      throw new ApiFailure("invalid_request", [
        { path: "level", message: "must be low, medium, or high" },
      ]);
    }
    const level = parsedLevel?.data ?? null;
    const rows = ofTenant(mockDb.riskScores, ctx.viewer.tenantId).filter(
      (row) =>
        isActiveRiskScore(row) &&
        learnerIds.has(row.learnerId) &&
        (learnerId === null || row.learnerId === learnerId) &&
        (level === null || row.level === level),
    );
    return list(ctx, rows, pageSchema(RiskScoreSchema));
  }),
  get("/risk-scores/:id", M, (ctx) => {
    const { learnerIds } = m46Access(ctx.viewer);
    const score = found(
      ofTenant(mockDb.riskScores, ctx.viewer.tenantId).find(
        (row) =>
          row.id === ctx.params["id"] && isActiveRiskScore(row) && learnerIds.has(row.learnerId),
      ),
    );
    return ok(RiskScoreSchema, score);
  }),
  get("/interventions", M, (ctx) => {
    const { learnerIds, checkLearner } = m46Access(ctx.viewer);
    const learnerId = param(ctx.url, "learnerId");
    if (learnerId !== null) checkLearner(learnerId);
    const rows = ofTenant(mockDb.interventions, ctx.viewer.tenantId).filter(
      (r) => learnerIds.has(r.learnerId) && (learnerId === null || r.learnerId === learnerId),
    );
    return list(ctx, rows, pageSchema(InterventionSchema));
  }),
];
