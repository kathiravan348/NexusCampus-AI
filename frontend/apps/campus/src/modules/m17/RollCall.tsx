import type { AttendanceMark, AttendanceMarkInput, AttendanceSession } from "@nexus/contracts";
import { useText, type MessageKey } from "@nexus/i18n";
import {
  useAttendanceMarks,
  useAttendanceRoster,
  useLearners,
  usePeople,
  type useSaveAttendanceMark,
} from "@nexus/services";
import { Badge, Button, EmptyState, Input } from "@nexus/ui-core";
import { useRef, useState } from "react";

interface RollCallProps {
  session: AttendanceSession;
  canMark: boolean;
  writer: ReturnType<typeof useSaveAttendanceMark>;
}

const statuses = ["present", "absent", "late", "excused"] as const;
const markLabels: Record<AttendanceMarkInput["status"], MessageKey> = {
  present: "m17.mark.present",
  absent: "m17.mark.absent",
  late: "m17.mark.late",
  excused: "m17.mark.excused",
  on_leave: "m17.mark.onLeave",
  remote: "m17.mark.remote",
};

type Draft = Pick<AttendanceMarkInput, "minutesLate" | "note"> & {
  status: AttendanceMarkInput["status"] | null;
};

const blank: Draft = { status: null, minutesLate: null, note: null };

export function RollCall({ session, canMark, writer }: RollCallProps) {
  const t = useText();
  const roster = useAttendanceRoster(session.id);
  const marks = useAttendanceMarks(session.id);
  const learners = useLearners();
  const people = usePeople();
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  if (roster.isError || marks.isError) return <EmptyState tone="error" title={t("common.error")} />;
  if (!roster.data || !marks.data) return <p role="status">{t("common.loading")}</p>;
  const entries = roster.data.items;
  const editable = canMark && session.status === "open";
  const peopleById = new Map(
    (people.isError ? [] : people.data?.items)?.map((row) => [
      row.id,
      row.preferredName || row.legalName,
    ]),
  );
  const names = new Map(
    (learners.isError ? [] : learners.data?.items)?.map((row) => [
      row.id,
      peopleById.get(row.personId),
    ]),
  );
  const latest = new Map<string, AttendanceMark>();
  for (const mark of marks.data.items) {
    const previous = latest.get(mark.learnerId);
    if (!previous || Date.parse(mark.markedAt) >= Date.parse(previous.markedAt))
      latest.set(mark.learnerId, mark);
  }
  const pending = new Map(writer.pendingMarks.map(({ input }) => [input.learnerId, input]));
  function savedMark(id: string) {
    return pending.get(id) ?? latest.get(id);
  }
  async function save(inputs: AttendanceMarkInput[]) {
    if (saving.current || !editable) return;
    saving.current = true;
    setBusy(true);
    setFailed(false);
    try {
      for (const input of inputs) {
        await writer.saveMark(input);
        setDrafts((current) => {
          const next = { ...current };
          delete next[input.learnerId];
          return next;
        });
      }
    } catch {
      setFailed(true);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="min-w-0 space-y-3">
      <h2 className="text-section-title font-semibold">{t("m17.rollCall.title")}</h2>
      {editable && entries.length > 0 && (
        <Button
          className="min-h-11"
          disabled={busy}
          variant="secondary"
          onClick={() =>
            void save(
              entries
                .filter(({ learnerId }) => savedMark(learnerId)?.status !== "present")
                .map(({ learnerId }) => ({
                  learnerId,
                  status: "present",
                  minutesLate: null,
                  note: savedMark(learnerId)?.note ?? null,
                })),
            )
          }
        >
          {t("m17.rollCall.markAll")}
        </Button>
      )}
      {(failed || writer.replayFailed) && (
        <p role="alert" className="text-danger-text">
          {t("m17.rollCall.failed")}
        </p>
      )}
      {entries.length === 0 && <EmptyState title={t("m17.rollCall.empty")} />}
      <ul className="space-y-3">
        {entries.map(({ learnerId, rollNumber }, index) => {
          const name =
            names.get(learnerId) ||
            (rollNumber
              ? t("m17.rollCall.learner", { roll: rollNumber })
              : t("m17.rollCall.unnumbered"));
          const saved = savedMark(learnerId);
          const draft = drafts[learnerId] ?? saved ?? blank;
          const change = (fields: Partial<Draft>) =>
            setDrafts((current) => ({
              ...current,
              [learnerId]: { ...draft, ...fields },
            }));
          return (
            <li
              key={learnerId}
              className="min-w-0 space-y-3 rounded-lg border border-border-default bg-bg-surface p-3"
            >
              <h3 id={`roll-name-${index}`} className="break-words font-semibold">
                {name}
              </h3>
              <div className="flex flex-wrap gap-2" aria-live="polite">
                <Badge tone="neutral">
                  {saved ? t(markLabels[saved.status]) : t("m17.rollCall.unmarked")}
                </Badge>
                {saved?.minutesLate != null && (
                  <span>{t("m17.rollCall.lateBy", { minutes: saved.minutesLate })}</span>
                )}
                {pending.has(learnerId) && (
                  <Badge tone="warning">{t("m17.rollCall.waiting")}</Badge>
                )}
              </div>
              {editable ? (
                <form
                  aria-labelledby={`roll-name-${index}`}
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (draft.status)
                      void save([
                        {
                          learnerId,
                          status: draft.status,
                          minutesLate: draft.status === "late" ? draft.minutesLate : null,
                          note: draft.note?.trim() || null,
                        },
                      ]);
                  }}
                >
                  <fieldset disabled={busy} className="min-w-0 space-y-3">
                    <div
                      role="group"
                      aria-label={t("m17.rollCall.status")}
                      className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap"
                    >
                      {statuses.map((status) => (
                        <button
                          key={status}
                          type="button"
                          aria-pressed={draft.status === status}
                          className="min-h-11 min-w-0 break-words rounded-md border border-border-default px-2 text-body-sm aria-pressed:border-brand-primary aria-pressed:bg-bg-raised aria-pressed:font-semibold focus-visible:outline-brand-primary"
                          onClick={() =>
                            change({
                              status,
                              minutesLate: status === "late" ? draft.minutesLate : null,
                            })
                          }
                        >
                          {t(markLabels[status])}
                        </button>
                      ))}
                    </div>
                    {draft.status === "late" && (
                      <Input
                        type="number"
                        className="min-h-11"
                        min={1}
                        max={600}
                        step={1}
                        required
                        label={t("m17.rollCall.minutes")}
                        value={draft.minutesLate ?? ""}
                        onChange={(event) =>
                          change({
                            minutesLate:
                              event.target.value === "" ? null : event.target.valueAsNumber,
                          })
                        }
                      />
                    )}
                    <Input
                      className="min-h-11"
                      label={t("m17.rollCall.note")}
                      maxLength={300}
                      value={draft.note ?? ""}
                      onChange={(event) => change({ note: event.target.value })}
                    />
                    <Button
                      type="submit"
                      className="min-h-11"
                      disabled={!draft.status || !drafts[learnerId]}
                    >
                      {t("common.save")}
                    </Button>
                  </fieldset>
                </form>
              ) : canMark && saved?.note ? (
                <p className="break-words">{saved.note}</p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
