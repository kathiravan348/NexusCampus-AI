import {
  EngagementSnapshotSchema,
  InterventionSchema,
  PAGE_SIZE_MAX,
  RiskScoreSchema,
  pageSchema,
  type RiskLevel,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const EngagementSnapshotPage = pageSchema(EngagementSnapshotSchema);
const RiskScorePage = pageSchema(RiskScoreSchema);
const InterventionPage = pageSchema(InterventionSchema);

export function useEngagementSnapshots(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m46.engagementSnapshots(s, learnerId),
    (c, signal) => c.get("/engagement", EngagementSnapshotPage, query, { signal }),
  );
}

export function useRiskScores(learnerId: string | null = null, level: RiskLevel | null = null) {
  const query = {
    ...all,
    ...(learnerId === null ? {} : { learnerId }),
    ...(level === null ? {} : { level }),
  };
  return useScopedQuery(
    (s) => queryKeys.m46.riskScores(s, learnerId, level),
    (c, signal) => c.get("/risk-scores", RiskScorePage, query, { signal }),
  );
}

export function useRiskScore(riskScoreId: string | null) {
  const path = `/risk-scores/${encodeURIComponent(riskScoreId ?? "")}`;
  return useScopedQuery(
    (s) => queryKeys.m46.riskScore(s, riskScoreId),
    (c, signal) => c.get(path, RiskScoreSchema, undefined, { signal }),
    riskScoreId !== null,
  );
}

export function useInterventions(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m46.interventions(s, learnerId),
    (c, signal) => c.get("/interventions", InterventionPage, query, { signal }),
  );
}
