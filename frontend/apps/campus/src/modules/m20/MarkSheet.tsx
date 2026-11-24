import type { Assessment, MarkEntryInput, Rubric } from "@nexus/contracts";
import { SOURCE_LOCALE, formatNumber, isPseudoLocale, useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAssessmentMarks,
  useAssessmentRoster,
  useLearners,
  usePeople,
  type useSaveMarkEntry,
} from "@nexus/services";
import { Badge, Button, Checkbox, EmptyState, Input, Select } from "@nexus/ui-core";
import { useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";

interface MarkSheetProps {
  assessment: Assessment;
  rubric: Rubric | null;
  canEnter: boolean;
  writer: ReturnType<typeof useSaveMarkEntry>;
}
interface RowDraft {
  marksText: string;
  absent: boolean;
  rubricScores: Record<string, string>;
  remark: string;
}
const ERR_KEY = {
  marks_max: "m20.markSheet.marksAboveMax",
  marks: "m20.markSheet.marksInvalid",
  rubric: "m20.markSheet.rubricRequired",
  remark: "m20.markSheet.remarkInvalid",
  closed: "m20.markSheet.closedError",
  failed: "m20.markSheet.failed",
} as const;
type ErrCode = keyof typeof ERR_KEY;
type Saved = Pick<MarkEntryInput, "marks" | "absent" | "rubricScores" | "remark">;

const ABSENT_FIELDS = { absent: true, marksText: "", rubricScores: {} };
const absentPatch = (c: unknown) => (c === true ? ABSENT_FIELDS : { absent: false });
const parseMarks = (s: string) => (s.trim() === "" ? null : Number(s.trim()));

function drop<T>(cur: Record<string, T>, id: string): Record<string, T> {
  return Object.fromEntries(Object.entries(cur).filter(([k]) => k !== id));
}

function errText(m: string) {
  return (
    <p role="alert" className="text-body-sm text-danger-text">
      {m}
    </p>
  );
}

function draftFrom(e?: Saved): RowDraft {
  const pairs = Object.entries(e?.rubricScores ?? {}).map(([k, v]) => [k, String(v)] as const);
  return {
    marksText: e?.marks != null ? String(e.marks) : "",
    absent: e?.absent ?? false,
    rubricScores: Object.fromEntries(pairs),
    remark: e?.remark ?? "",
  };
}
function parseRow(row: RowDraft, max: number, rubric: Rubric | null): MarkEntryInput | ErrCode {
  const marks = row.absent ? null : parseMarks(row.marksText);
  if (!row.absent && marks !== null) {
    if (!Number.isFinite(marks) || marks < 0 || !Number.isInteger(marks * 2)) return "marks";
    if (marks > max) return "marks_max";
  }
  const scores = rubric && !row.absent ? new Map<string, number>() : null;
  for (const { code, levels } of scores && rubric ? rubric.criteria : []) {
    const score = row.rubricScores[code] ? Number(row.rubricScores[code]) : Number.NaN;
    if (!levels.some((l) => l.score === score)) return "rubric";
    scores.set(code, score);
  }
  const remark = row.remark.trim();
  if (remark.length > 500) return "remark";
  const rubricScores = scores ? Object.fromEntries(scores) : null;
  return { marks, absent: row.absent, rubricScores, remark: remark || null };
}
function apiErrCode(error: unknown, parsed: number | null, max: number): ErrCode {
  if (!(error instanceof ApiRequestError)) return "failed";
  const paths = new Set(error.error.details?.map((d) => d.path) ?? []);
  if (error.status === 409 || paths.has("status")) return "closed";
  if (error.status === 400) {
    if (paths.has("marks")) return parsed !== null && parsed > max ? "marks_max" : "marks";
    if (paths.has("rubricScores")) return "rubric";
    if (paths.has("remark")) return "remark";
  }
  return "failed";
}

export function MarkSheet({ assessment, rubric, canEnter, writer }: MarkSheetProps) {
  const t = useText();
  const { locale } = useRuntime();
  const roster = useAssessmentRoster(assessment.id);
  const marks = useAssessmentMarks(assessment.id);
  const learners = useLearners();
  const people = usePeople();
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({});
  const [errors, setErrors] = useState<Record<string, ErrCode>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  if (roster.isError || marks.isError) return <EmptyState tone="error" title={t("common.error")} />;
  if (!roster.data || !marks.data) return <p role="status">{t("common.loading")}</p>;

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const maxLabel = formatNumber(assessment.maxMarks, safeLocale);
  const editable = canEnter && (assessment.status === "open" || assessment.status === "marking");
  const persons = !people.isError && people.data ? people.data.items : [];
  const byPerson = new Map(persons.map((r) => [r.id, r.preferredName || r.legalName] as const));
  const learnerRows = !learners.isError && learners.data ? learners.data.items : [];
  const names = new Map(learnerRows.map((r) => [r.id, byPerson.get(r.personId)] as const));
  const savedMap = new Map(marks.data.items.map((r) => [r.learnerId, r] as const));
  const pendingMap = new Map(writer.pendingEntries.map((r) => [r.learnerId, r.input] as const));
  const pct = (m: number | null) => {
    if (m === null || !Number.isFinite(m) || m < 0 || m > assessment.maxMarks) {
      return t("m20.markSheet.noPercent");
    }
    const n = Math.round((m / assessment.maxMarks) * 1000) / 10;
    const value = formatNumber(n, safeLocale, { maximumFractionDigits: 1 });
    return t("m20.markSheet.percent", { value });
  };
  const criteria = rubric?.criteria.map((c) => ({
    ...c,
    options: c.levels.map((l) => ({
      value: String(l.score),
      label: t("m20.markSheet.rubricLevel", {
        score: formatNumber(l.score, safeLocale),
        descriptor: l.descriptor,
      }),
    })),
  }));

  async function saveRow(learnerId: string, draft: RowDraft) {
    if (!editable || savingId !== null) return;
    const result = parseRow(draft, assessment.maxMarks, rubric);
    if (typeof result === "string") return setErrors((cur) => ({ ...cur, [learnerId]: result }));
    setSavingId(learnerId);
    setErrors((cur) => drop(cur, learnerId));
    try {
      await writer.saveMark(learnerId, result);
      setDrafts((cur) => drop(cur, learnerId));
    } catch (error) {
      const parsed = draft.absent ? null : parseMarks(draft.marksText);
      const code = apiErrCode(error, parsed, assessment.maxMarks);
      setErrors((cur) => ({ ...cur, [learnerId]: code }));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="min-w-0 space-y-3">
      <h2 className="text-section-title font-semibold text-text-primary">
        {t("m20.markSheet.title")}
      </h2>
      {!editable && (
        <p className="text-body-sm text-text-secondary">{t("m20.markSheet.readOnly")}</p>
      )}
      {writer.replayFailed && errText(t("m20.markSheet.failed"))}
      {roster.data.items.length === 0 && <EmptyState title={t("m20.markSheet.empty")} />}
      <ul className="space-y-3">
        {roster.data.items.map(({ learnerId, rollNumber }, index) => {
          const saved = pendingMap.get(learnerId) ?? savedMap.get(learnerId);
          const draft = drafts[learnerId] ?? draftFrom(saved);
          const err = errors[learnerId];
          const errMsg = err ? t(ERR_KEY[err], { max: maxLabel }) : undefined;
          const fieldErr = (ok: boolean) => (ok && errMsg ? { error: errMsg } : {});
          const fallback = rollNumber
            ? t("m20.markSheet.learner", { roll: rollNumber })
            : t("m20.markSheet.unnumbered");
          const fmtMarks = saved?.marks != null ? formatNumber(saved.marks, safeLocale) : null;
          const badge = saved?.absent
            ? t("m20.markSheet.absent")
            : fmtMarks !== null
              ? t("m20.markSheet.scoreSummary", { marks: fmtMarks, max: maxLabel })
              : t("m20.markSheet.notEntered");
          const change = (fields: Partial<RowDraft>) => {
            setDrafts((cur) => ({ ...cur, [learnerId]: { ...draft, ...fields } }));
            setErrors((cur) => drop(cur, learnerId));
          };
          const setRubric = (code: string, val: string) =>
            change({ rubricScores: { ...draft.rubricScores, [code]: val } });
          return (
            <li
              key={learnerId}
              className="min-w-0 space-y-3 rounded-lg border border-border-default bg-bg-surface p-3"
            >
              <h3 id={`mark-learner-${index}`} className="break-words font-semibold">
                {names.get(learnerId) || fallback}
              </h3>
              <div className="flex flex-wrap items-center gap-2" aria-live="polite">
                <Badge tone="neutral">{badge}</Badge>
                {!saved?.absent && saved?.marks != null && (
                  <span className="font-mono text-body-sm text-text-secondary">
                    {pct(saved.marks)}
                  </span>
                )}
                {pendingMap.has(learnerId) && (
                  <Badge tone="warning">{t("m20.markSheet.waiting")}</Badge>
                )}
              </div>
              {editable ? (
                <form
                  aria-labelledby={`mark-learner-${index}`}
                  noValidate
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveRow(learnerId, draft);
                  }}
                >
                  <fieldset disabled={savingId === learnerId} className="min-w-0 space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
                      <Input
                        type="number"
                        numeric
                        className="min-h-11"
                        min={0}
                        max={assessment.maxMarks}
                        step={0.5}
                        disabled={draft.absent}
                        label={t("m20.markSheet.marks")}
                        description={t("m20.markSheet.marksHint", { max: maxLabel })}
                        value={draft.marksText}
                        {...fieldErr(err === "marks" || err === "marks_max")}
                        onChange={(e) => change({ marksText: e.target.value })}
                      />
                      <Checkbox
                        containerClassName="min-h-11 justify-center"
                        label={t("m20.markSheet.absent")}
                        checked={draft.absent}
                        onCheckedChange={(c) => change(absentPatch(c))}
                      />
                      <div className="flex min-h-11 flex-col justify-center">
                        <span className="text-label font-semibold text-text-secondary">
                          {t("m20.markSheet.percentLabel")}
                        </span>
                        <span className="font-mono text-body text-text-primary">
                          {pct(draft.absent ? null : parseMarks(draft.marksText))}
                        </span>
                      </div>
                    </div>
                    {criteria && (
                      <>
                        <p className="text-body-sm font-semibold text-text-primary">
                          {t("m20.markSheet.rubricHeading")}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          {criteria.map((c) => (
                            <Select
                              key={c.code}
                              className="min-h-11"
                              label={c.label}
                              placeholder={t("common.selectOption")}
                              disabled={draft.absent}
                              value={draft.rubricScores[c.code] ?? ""}
                              options={c.options}
                              onChange={(e) => setRubric(c.code, e.target.value)}
                            />
                          ))}
                        </div>
                        {err === "rubric" && errMsg && errText(errMsg)}
                      </>
                    )}
                    <Input
                      className="min-h-11"
                      label={t("m20.markSheet.remark")}
                      maxLength={500}
                      value={draft.remark}
                      {...fieldErr(err === "remark")}
                      onChange={(e) => change({ remark: e.target.value })}
                    />
                    {(err === "closed" || err === "failed") && errMsg && errText(errMsg)}
                    <Button type="submit" className="min-h-11" disabled={savingId !== null}>
                      {t("common.save")}
                    </Button>
                  </fieldset>
                </form>
              ) : (
                <div className="space-y-1 text-body-sm text-text-secondary">
                  {criteria?.map(({ code, label, options }) => {
                    const score = saved?.rubricScores?.[code];
                    const hit = options.find((o) => o.value === String(score));
                    if (!hit) return null;
                    return (
                      <p key={code} className="break-words">
                        <strong className="text-text-primary">{label}</strong> {hit.label}
                      </p>
                    );
                  })}
                  {saved?.remark && <p className="break-words">{saved.remark}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
