import {
  DaySummarySchema,
  DiaryEntrySchema,
  MilestoneProgressSchema,
  ObservationSchema,
  PAGE_SIZE_MAX,
  PickupCheckSchema,
  RatioSnapshotSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const DiaryEntryPage = pageSchema(DiaryEntrySchema);
const ObservationPage = pageSchema(ObservationSchema);
const MilestoneProgressPage = pageSchema(MilestoneProgressSchema);
const DaySummaryPage = pageSchema(DaySummarySchema);
const PickupCheckPage = pageSchema(PickupCheckSchema);
const RatioSnapshotPage = pageSchema(RatioSnapshotSchema);

export function useDiaryEntries(learnerId: string | null = null, date: string | null = null) {
  const query = {
    ...all,
    ...(learnerId === null ? {} : { learnerId }),
    ...(date === null ? {} : { date }),
  };
  return useScopedQuery(
    (s) => queryKeys.m37.diaryEntries(s, learnerId, date),
    (c, signal) => c.get("/diary-entries", DiaryEntryPage, query, { signal }),
  );
}

export function useObservations(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m37.observations(s, learnerId),
    (c, signal) => c.get("/observations", ObservationPage, query, { signal }),
  );
}

export function useMilestoneProgress(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m37.milestoneProgress(s, learnerId),
    (c, signal) => c.get("/milestone-progress", MilestoneProgressPage, query, { signal }),
  );
}

export function useDaySummaries(learnerId: string | null = null) {
  const query = learnerId === null ? all : { ...all, learnerId };
  return useScopedQuery(
    (s) => queryKeys.m37.daySummaries(s, learnerId),
    (c, signal) => c.get("/day-summaries", DaySummaryPage, query, { signal }),
  );
}

export function usePickupChecks(learnerId: string | null = null, date: string | null = null) {
  const query = {
    ...all,
    ...(learnerId === null ? {} : { learnerId }),
    ...(date === null ? {} : { date }),
  };
  return useScopedQuery(
    (s) => queryKeys.m37.pickupChecks(s, learnerId, date),
    (c, signal) => c.get("/pickup-checks", PickupCheckPage, query, { signal }),
  );
}

export function useRatioSnapshots() {
  return useScopedQuery(
    (s) => queryKeys.m37.ratioSnapshots(s),
    (c, signal) => c.get("/ratio-snapshots", RatioSnapshotPage, all, { signal }),
  );
}
