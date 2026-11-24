import {
  AssessmentSchema,
  AttendanceRosterEntrySchema,
  GradingSchemeSchema,
  MarkEntrySchema,
  PAGE_SIZE_MAX,
  RubricSchema,
  pageSchema,
  type MarkEntry,
  type MarkEntryInput,
  type Page,
} from "@nexus/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "../client";
import { queryKeys, type KeyScope } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery } from "../query";
import { useSession } from "../session";

const all = { pageSize: PAGE_SIZE_MAX };
const GradingSchemePage = pageSchema(GradingSchemeSchema);
const AssessmentPage = pageSchema(AssessmentSchema);
const RubricPage = pageSchema(RubricSchema);
const RosterPage = pageSchema(AttendanceRosterEntrySchema);
const MarkEntryPage = pageSchema(MarkEntrySchema);

async function collectPages<T>(fetchPage: (page: number) => Promise<Page<T>>) {
  const first = await fetchPage(1);
  const items = [...first.items];
  for (let page = 2; page <= Math.ceil(first.total / first.pageSize); page++) {
    items.push(...(await fetchPage(page)).items);
  }
  return { ...first, items };
}

export function useGradingSchemes() {
  return useScopedQuery(queryKeys.m20.gradingSchemes, (c, signal) =>
    c.get("/grading-schemes", GradingSchemePage, all, { signal }),
  );
}

export function useAssessments(classGroupId: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m20.assessments(s, classGroupId),
    (c, signal) =>
      collectPages((page) =>
        c.get("/assessments", AssessmentPage, { ...all, page, classGroupId }, { signal }),
      ),
  );
}

export function useRubrics() {
  return useScopedQuery(queryKeys.m20.rubrics, (c, signal) =>
    c.get("/rubrics", RubricPage, all, { signal }),
  );
}

export function useAssessmentRoster(assessmentId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m20.assessmentRoster(s, assessmentId),
    (c, signal) =>
      collectPages((page) =>
        c.get(
          `/assessments/${encodeURIComponent(assessmentId ?? "")}/roster`,
          RosterPage,
          { ...all, page },
          { signal },
        ),
      ),
    assessmentId !== null,
  );
}

export function useAssessmentMarks(assessmentId: string | null) {
  return useScopedQuery(
    (s) => queryKeys.m20.assessmentMarks(s, assessmentId),
    (c, signal) =>
      collectPages((page) =>
        c.get(
          `/assessments/${encodeURIComponent(assessmentId ?? "")}/marks`,
          MarkEntryPage,
          { ...all, page },
          { signal },
        ),
      ),
    assessmentId !== null,
  );
}

interface MarkEntryWrite extends KeyScope {
  assessmentId: string;
  learnerId: string;
  clientId: string;
  input: MarkEntryInput;
}

interface LocalMarkEntry extends MarkEntryWrite {
  state: "saving" | "queued" | "failed";
}

function pendingKey(scope: KeyScope, assessmentId: string | null) {
  return [...queryKeys.m20.assessmentMarks(scope, assessmentId), "pending"];
}

export function useSaveMarkEntry(assessmentId: string | null) {
  const { session } = useSession();
  const qc = useQueryClient();
  const pending = useQuery<LocalMarkEntry[]>({
    queryKey: session ? pendingKey(session, assessmentId) : ["signed-out", "gradebook-pending"],
    queryFn: () => [],
    enabled: false,
    gcTime: Infinity,
  });
  const mutation = useOutboxMutation<MarkEntryWrite, MarkEntry>({
    moduleId: "M20",
    operation: "marks.enter",
    mergeRule: "lww-audited",
    priority: "normal",
    send: async (client, write, idempotencyKey) => {
      // Replay the assessment stored with the write, even if another assessment is now open.
      if (!session || session.tenantId !== write.tenantId || session.userId !== write.userId) {
        throw new Error("Gradebook account changed");
      }
      const local = pendingKey(write, write.assessmentId);
      const assessmentSegment = encodeURIComponent(write.assessmentId);
      const learnerSegment = encodeURIComponent(write.learnerId);
      const markPath = `/assessments/${assessmentSegment}/marks/${learnerSegment}`;
      let entry: MarkEntry;
      try {
        entry = await client.send("PUT", markPath, write.input, MarkEntrySchema, {
          headers: idempotencyHeaders(idempotencyKey),
        });
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 429
        ) {
          qc.setQueryData<LocalMarkEntry[]>(local, (rows) =>
            rows?.map((row) =>
              row.clientId === write.clientId ? { ...row, state: "failed" } : row,
            ),
          );
        }
        throw error;
      }
      const key = queryKeys.m20.assessmentMarks(write, write.assessmentId);
      if (qc.getQueryData(key)) {
        await qc.cancelQueries({ queryKey: key, exact: true });
        qc.setQueryData<Page<MarkEntry>>(key, (previous) => {
          if (!previous) return previous;
          const index = previous.items.findIndex(
            (item) => item.id === entry.id || item.learnerId === entry.learnerId,
          );
          if (index >= 0) {
            const items = [...previous.items];
            items[index] = entry;
            return { ...previous, items };
          }
          return { ...previous, items: [...previous.items, entry], total: previous.total + 1 };
        });
      } else {
        await qc.invalidateQueries({ queryKey: key, exact: true });
      }
      qc.setQueryData<LocalMarkEntry[]>(local, (rows) =>
        rows?.filter((row) => row.clientId !== write.clientId),
      );
      return entry;
    },
  });

  async function saveMark(learnerId: string, input: MarkEntryInput) {
    if (!session || !assessmentId) throw new Error("Assessment required");
    const write: MarkEntryWrite = {
      tenantId: session.tenantId,
      userId: session.userId,
      assessmentId,
      learnerId,
      clientId: crypto.randomUUID(),
      input,
    };
    const key = pendingKey(session, assessmentId);
    qc.setQueryData<LocalMarkEntry[]>(key, (rows) => [
      ...(rows ?? []).filter((row) => row.state !== "failed" || row.learnerId !== learnerId),
      { ...write, state: "saving" },
    ]);
    try {
      const result = await mutation.mutateAsync(write);
      if (result.queued) {
        // A fast reconnect may already have replayed and removed this write.
        qc.setQueryData<LocalMarkEntry[]>(key, (rows) =>
          rows?.map((row) =>
            row.clientId === write.clientId && row.state === "saving"
              ? { ...row, state: "queued" }
              : row,
          ),
        );
      }
      return result;
    } catch (error) {
      qc.setQueryData<LocalMarkEntry[]>(key, (rows) =>
        rows?.filter((row) => row.clientId !== write.clientId),
      );
      throw error;
    }
  }

  const rows = pending.data ?? [];
  return {
    saveMark,
    pendingEntries: rows.filter((row) => row.state === "queued"),
    replayFailed: rows.some((row) => row.state === "failed"),
  };
}
