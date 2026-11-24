import type { ExamPaper, ExamStatus } from "@nexus/contracts";
import {
  formatDate,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import {
  ApiRequestError,
  useExams,
  useExamPapers,
  useRooms,
  useSubjectOfferings,
  useSubjects,
} from "@nexus/services";
import { Badge, Card, Select } from "@nexus/ui-core";
import { useSearchParams } from "react-router";
import { useRuntime } from "../../app/TenantRuntime";

const statusKeys: Record<ExamStatus, MessageKey> = {
  planned: "m21.status.planned",
  scheduled: "m21.status.scheduled",
  running: "m21.status.running",
  results_pending: "m21.status.resultsPending",
  published: "m21.status.published",
};

export function readState(query: { data: unknown; error: unknown }): MessageKey | null {
  if (query.error instanceof ApiRequestError && query.error.status === 403) {
    return "common.shell.forbiddenTitle";
  }
  if (query.data) return null;
  return query.error ? "common.error" : "common.loading";
}

export function useExamSelection() {
  const exams = useExams();
  const [params, setParams] = useSearchParams();
  const items = exams.data?.items ?? [];
  const selected = items.find((row) => row.id === params.get("exam")) ?? items[0];
  const choose = (id: string) => {
    const next = new URLSearchParams(params);
    next.set("exam", id);
    setParams(next);
  };
  return { exams, items, selected, choose };
}

export function usePaperNames() {
  const subjects = useSubjects();
  const offerings = useSubjectOfferings(null);
  const names = new Map(
    readState(subjects) ? [] : subjects.data?.items.map((row) => [row.id, row.name]),
  );
  return new Map(
    readState(offerings)
      ? []
      : offerings.data?.items.map((row) => [row.id, names.get(row.subjectId)]),
  );
}

export function useExamFormats() {
  const { locale, timeZone } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  return {
    day: (value: string) => formatDate(value, { locale: safeLocale }),
    issued: (value: string) => formatDate(value, { locale: safeLocale, timeZone }),
    number: (value: number) => formatNumber(value, safeLocale),
  };
}

export function paperTime(paper: ExamPaper, t: ReturnType<typeof useText>) {
  return t("m21.schedule.times", {
    startHour: Number(paper.start.slice(0, 2)),
    startMinute: Number(paper.start.slice(3, 5)),
    endHour: Number(paper.end.slice(0, 2)),
    endMinute: Number(paper.end.slice(3, 5)),
  });
}

export function ScheduleTab() {
  const t = useText();
  const { exams, items, selected, choose } = useExamSelection();
  const papers = useExamPapers(selected?.id ?? null);
  const names = usePaperNames();
  const rooms = useRooms();
  const roomNames = new Map(rooms.data?.items.map((room) => [room.id, room.name]));
  const { day, number } = useExamFormats();
  const examState = readState(exams);
  if (examState || !selected) return <p role="status">{t(examState ?? "m21.schedule.empty")}</p>;
  const paperState = readState(papers);

  return (
    <section className="min-w-0 space-y-4 break-words">
      <Select
        className="min-h-11"
        label={t("m21.tickets.exam")}
        value={selected.id}
        options={items.map((exam) => ({ value: exam.id, label: exam.name }))}
        onChange={(event) => choose(event.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <span>
          {t("m21.schedule.dates", { start: day(selected.startsOn), end: day(selected.endsOn) })}
        </span>
        <Badge tone="info">{t(statusKeys[selected.status])}</Badge>
      </div>
      <Card title={t("m21.schedule.papers")}>
        {paperState || !papers.data?.items.length ? (
          <p role="status">{t(paperState ?? "m21.schedule.noPapers")}</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {papers.data.items.map((paper) => (
              <li
                key={paper.id}
                className="min-w-0 space-y-1 rounded-md border border-border-default p-3"
              >
                <h3 className="font-semibold">
                  {names.get(paper.subjectOfferingId) ?? t("m21.revaluation.paper")}
                </h3>
                <p>
                  {day(paper.date)} · {paperTime(paper, t)}
                </p>
                <p>
                  {t("m21.schedule.rooms", {
                    rooms:
                      paper.roomIds
                        .map((id) => roomNames.get(id) ?? t("m21.seating.room"))
                        .join(", ") || t("m21.schedule.unassigned"),
                  })}
                </p>
                <p>{t("m21.schedule.maxMarks", { marks: number(paper.maxMarks) })}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
