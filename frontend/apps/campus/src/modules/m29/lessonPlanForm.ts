import type { LessonActivityKind, LessonPlan, LessonPlanInput } from "@nexus/contracts";
import { isKnownMessageKey, type MessageKey, type Translate } from "@nexus/i18n";
import { ApiRequestError } from "@nexus/services";
import type { UseFormSetError } from "react-hook-form";

export const ACTIVITY_KINDS: readonly LessonActivityKind[] = [
  "intro",
  "instruction",
  "practice",
  "discussion",
  "assessment",
  "other",
];

export const ACTIVITY_KIND_KEY: Readonly<Record<LessonActivityKind, MessageKey>> = {
  intro: "m29.activityKind.intro",
  instruction: "m29.activityKind.instruction",
  practice: "m29.activityKind.practice",
  discussion: "m29.activityKind.discussion",
  assessment: "m29.activityKind.assessment",
  other: "m29.activityKind.other",
};

const SERVER_FIELD_KEYS: Readonly<Record<string, readonly [keyof LessonPlanInput, MessageKey]>> = {
  subjectOfferingId: ["subjectOfferingId", "m29.planDialog.invalidOffering"],
  topicIds: ["topicIds", "m29.planDialog.invalidTopics"],
  outcomeIds: ["outcomeIds", "m29.planDialog.invalidOutcomes"],
  title: ["title", "m29.planDialog.titleInvalid"],
  date: ["date", "m29.planDialog.dateInvalid"],
  activities: ["activities", "m29.planDialog.activitiesInvalid"],
};

export const nullableDate = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? value.trim() : null;

export function parseMinutes(value: unknown): number {
  if (typeof value === "number") return value;
  const trimmed = String(value ?? "").trim();
  return trimmed === "" ? Number.NaN : Number(trimmed);
}

export function renumberActivities(
  items: LessonPlanInput["activities"],
): LessonPlanInput["activities"] {
  return items.map((item, idx) => ({ ...item, order: idx + 1 }));
}

export function resolveFormError(
  error: { readonly message?: string } | undefined,
  fallbackKey: MessageKey,
  t: Translate,
): string | undefined {
  if (!error) return undefined;
  return error.message && isKnownMessageKey(error.message) ? t(error.message) : t(fallbackKey);
}

export function lessonPlanDefaults(
  plan: LessonPlan | null,
  offeringId: string,
  staffProfileId: string,
): LessonPlanInput {
  return {
    subjectOfferingId: plan?.subjectOfferingId ?? offeringId,
    staffProfileId,
    date: plan?.date ?? null,
    timetableSlotId: plan?.timetableSlotId ?? null,
    title: plan?.title ?? "",
    topicIds: plan ? [...plan.topicIds] : [],
    outcomeIds: plan ? [...plan.outcomeIds] : [],
    objectives: plan?.objectives ?? "",
    activities: plan ? renumberActivities(plan.activities) : [],
    resources: plan?.resources ?? "",
    source: "manual",
  };
}

export function applyLessonPlanApiError(
  error: unknown,
  setError: UseFormSetError<LessonPlanInput>,
  onUnexpected: () => void,
): void {
  if (error instanceof ApiRequestError && error.error.code === "conflict") {
    setError("root", { type: "server", message: "m29.planDialog.conflict" });
    return;
  }
  if (error instanceof ApiRequestError && error.error.code === "forbidden") {
    setError("root", { type: "server", message: "m29.planDialog.forbidden" });
    return;
  }
  if (error instanceof ApiRequestError && error.error.code === "invalid_request") {
    let matched = false;
    for (const detail of error.error.details ?? []) {
      const mapped = SERVER_FIELD_KEYS[detail.path];
      if (mapped) {
        setError(mapped[0], { type: "server", message: mapped[1] });
        matched = true;
      }
    }
    if (!matched) setError("root", { type: "server", message: "m29.planDialog.invalidRequest" });
    return;
  }
  setError("root", { type: "server", message: "m29.planDialog.saveFailed" });
  onUnexpected();
}
