import type { LessonPlan, LessonPlanStatus } from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import {
  useClassGroups,
  useLessonPlans,
  useMarkLessonPlanDelivered,
  useMe,
  useReviewLessonPlan,
  useSubmitLessonPlan,
  useSubjectOfferings,
  useSubjects,
  useSyllabusUnits,
} from "@nexus/services";
import { Badge, Button, Card, EmptyState, Select, Skeleton, useToast } from "@nexus/ui-core";
import {
  Calendar,
  CheckCheck,
  CheckCircle2,
  FilePenLine,
  FileText,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { LessonPlanActions } from "./LessonPlanActions";
import { LessonPlanReviewDialog } from "./LessonPlanReviewDialog";
import { LessonPlanDialog } from "./LessonPlanDialog";

const STATUS_META: Readonly<
  Record<
    LessonPlanStatus,
    {
      readonly key: MessageKey;
      readonly icon: typeof FileText;
      readonly tone: "neutral" | "info" | "success" | "warning" | "brand";
    }
  >
> = {
  draft: { key: "m29.planStatus.draft", tone: "neutral", icon: FilePenLine },
  submitted: { key: "m29.planStatus.submitted", tone: "info", icon: Send },
  approved: { key: "m29.planStatus.approved", tone: "success", icon: CheckCircle2 },
  returned: { key: "m29.planStatus.returned", tone: "warning", icon: RotateCcw },
  delivered: { key: "m29.planStatus.delivered", tone: "brand", icon: CheckCheck },
};

export interface LessonPlansTabProps {
  readonly canWrite: boolean;
  readonly ownStaffProfileId: string | null;
}

/** Lesson plans per subject offering with stacked cards at 360 px and offline-capable draft dialog. */
export function LessonPlansTab({ canWrite, ownStaffProfileId }: LessonPlansTabProps) {
  const t = useText();
  const { locale } = useRuntime();
  const offerings = useSubjectOfferings();
  const subjects = useSubjects();
  const classGroups = useClassGroups();
  const allUnits = useSyllabusUnits();
  const [selectedOfferingId, setSelectedOfferingId] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<LessonPlan | null>(null);

  const me = useMe();
  const canReview = me.data?.permissions.includes("m29.lessonplan.review") ?? false;
  const submit = useSubmitLessonPlan();
  const review = useReviewLessonPlan();
  const deliver = useMarkLessonPlanDelivered();
  const toast = useToast();
  const [reviewing, setReviewing] = useState<{
    plan: LessonPlan;
    decision: "approve" | "return";
  } | null>(null);

  async function notify(action: Promise<{ queued: boolean }>) {
    try {
      const { queued } = await action;
      toast.show(
        queued
          ? { tone: "info", title: t("m29.planDialog.queued") }
          : { tone: "success", title: t("m29.workflow.saved") },
      );
      return true;
    } catch {
      toast.show({ tone: "danger", title: t("m29.planDialog.saveFailed") });
      return false;
    }
  }

  const plans = useLessonPlans(selectedOfferingId === "" ? null : selectedOfferingId);
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  const offeringList = useMemo(() => offerings.data?.items ?? [], [offerings.data?.items]);
  const classGroupList = useMemo(() => classGroups.data?.items ?? [], [classGroups.data?.items]);
  const subjectById = useMemo(
    () => new Map((subjects.data?.items ?? []).map((row) => [row.id, row])),
    [subjects.data?.items],
  );
  const groupById = useMemo(
    () => new Map(classGroupList.map((row) => [row.id, row])),
    [classGroupList],
  );

  const offeringLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of offeringList) {
      const subject = subjectById.get(row.subjectId);
      const group = groupById.get(row.classGroupId);
      map.set(
        row.id,
        subject && group ? `${subject.name} — ${group.name}` : (subject?.name ?? row.id),
      );
    }
    return map;
  }, [offeringList, subjectById, groupById]);

  const offeringOptions = useMemo(
    () => [
      { value: "", label: t("m29.plans.allOfferings") },
      ...offeringList.map((row) => ({
        value: row.id,
        label: offeringLabels.get(row.id) ?? row.id,
      })),
    ],
    [offeringList, offeringLabels, t],
  );

  const defaultOfferingId = useMemo(() => {
    if (selectedOfferingId) return selectedOfferingId;
    const subjectsWithUnits = new Set((allUnits.data?.items ?? []).map((row) => row.subjectId));
    const ownWithSyllabus = ownStaffProfileId
      ? offeringList.find(
          (row) =>
            row.staffProfileIds.includes(ownStaffProfileId) && subjectsWithUnits.has(row.subjectId),
        )
      : undefined;
    if (ownWithSyllabus) return ownWithSyllabus.id;
    const anyWithSyllabus = offeringList.find((row) => subjectsWithUnits.has(row.subjectId));
    return anyWithSyllabus?.id ?? offeringList[0]?.id ?? "";
  }, [selectedOfferingId, allUnits.data?.items, ownStaffProfileId, offeringList]);

  const loading =
    (plans.isPending && !plans.data) ||
    (offerings.isPending && !offerings.data) ||
    (subjects.isPending && !subjects.data) ||
    (classGroups.isPending && !classGroups.data);
  const failed = (plans.isError && !plans.data) || (offerings.isError && !offerings.data);

  const openEditor = (plan: LessonPlan | null) => {
    setEditingPlan(plan);
    setDialogOpen(true);
  };

  const planList = plans.data?.items ?? [];
  const canAuthor = canWrite && ownStaffProfileId !== null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <Select
          label={t("m29.plans.offering")}
          options={offeringOptions}
          value={selectedOfferingId}
          onChange={(e) => setSelectedOfferingId(e.target.value)}
          containerClassName="w-full sm:w-80"
        />
        {canAuthor && (
          <Button onClick={() => openEditor(null)} disabled={offeringList.length === 0}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            {t("m29.plans.newPlan")}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3" role="status" aria-label={t("common.loading")}>
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : failed ? (
        <EmptyState
          tone="error"
          title={t("m29.plans.error")}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                void plans.refetch();
                void offerings.refetch();
              }}
            >
              {t("common.retry")}
            </Button>
          }
        />
      ) : planList.length === 0 ? (
        <EmptyState
          icon={<FileText className="h-6 w-6" />}
          title={t("m29.plans.empty")}
          description={t("m29.plans.emptyBody")}
        />
      ) : (
        <ul className="space-y-3">
          {planList.map((plan) => {
            const statusMeta = STATUS_META[plan.status];
            const StatusIcon = statusMeta.icon;

            return (
              <li key={plan.id} className="min-w-0">
                <Card
                  headingAs="h3"
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="break-words">{plan.title}</span>
                      <Badge tone={statusMeta.tone}>
                        <StatusIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {t(statusMeta.key)}
                      </Badge>
                      {plan.source === "ai_draft" && (
                        <Badge tone="info">
                          <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span>{t("m29.plans.aiDraft")}</span>
                        </Badge>
                      )}
                    </span>
                  }
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-text-secondary">
                      <span className="break-words">
                        {offeringLabels.get(plan.subjectOfferingId) ?? plan.subjectOfferingId}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {plan.date
                          ? formatDate(plan.date, { locale: safeLocale })
                          : t("m29.plans.unscheduled")}
                      </span>
                      <span>{t("m29.plans.topicsCount", { count: plan.topicIds.length })}</span>
                      <span>
                        {t("m29.plans.activitiesCount", { count: plan.activities.length })}
                      </span>
                    </div>

                    {plan.status === "returned" && plan.reviewNote && (
                      <div className="rounded-md border border-warning bg-warning-subtle p-3 text-body-sm text-warning-text">
                        <p className="font-semibold">{t("m29.plans.reviewerNote")}</p>
                        <p className="mt-1 break-words">{plan.reviewNote}</p>
                      </div>
                    )}
                    <LessonPlanActions
                      plan={plan}
                      ownStaffProfileId={ownStaffProfileId}
                      canWrite={canWrite}
                      canReview={canReview}
                      pending={submit.isPending || review.isPending || deliver.isPending}
                      onEdit={() => openEditor(plan)}
                      onSubmit={() => void notify(submit.mutateAsync({ id: plan.id, input: {} }))}
                      onDeliver={(deliveredOn) =>
                        void notify(deliver.mutateAsync({ id: plan.id, input: { deliveredOn } }))
                      }
                      onReview={(decision) => setReviewing({ plan, decision })}
                    />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {reviewing && (
        <LessonPlanReviewDialog
          title={reviewing.plan.title}
          decision={reviewing.decision}
          onClose={() => setReviewing(null)}
          onSave={(input) => notify(review.mutateAsync({ id: reviewing.plan.id, input }))}
        />
      )}
      {canAuthor && (
        <LessonPlanDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          plan={editingPlan}
          defaultOfferingId={defaultOfferingId}
          ownStaffProfileId={ownStaffProfileId}
          offerings={offeringList}
          offeringLabels={offeringLabels}
          classGroups={classGroupList}
        />
      )}
    </div>
  );
}
