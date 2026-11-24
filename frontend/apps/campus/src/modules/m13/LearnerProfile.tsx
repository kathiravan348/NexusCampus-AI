import type {
  EnrolmentStatus,
  HealthFlagKind,
  LearnerDocumentKind,
  LearnerStatus,
} from "@nexus/contracts";
import {
  baseLanguage,
  formatDate,
  formatNumber,
  formatPhone,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import {
  ApiRequestError,
  useClassGroups,
  useCustomFields,
  useLearner,
  useLearnerDocuments,
  useLearnerEnrolments,
  usePeople,
  usePrograms,
  useYearLevels,
} from "@nexus/services";
import { Badge, Button, Card, cn, EmptyState, Skeleton, type BadgeProps } from "@nexus/ui-core";
import { ArrowLeft, FileText, SearchX } from "lucide-react";
import type { ReactNode } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useRuntime } from "../../app/TenantRuntime";
import { Forbidden } from "../../pages/Forbidden";
import { GuardianList } from "../m14/GuardianList";

type Spec = readonly [MessageKey, NonNullable<BadgeProps["tone"]>];
type FieldRow = readonly [label: string, value: string, mono?: boolean, ltr?: boolean];
export const LEARNER_STATUS: Readonly<Record<LearnerStatus, Spec>> = {
  enrolled: ["m13.status.enrolled", "success"],
  on_leave: ["m13.status.onLeave", "warning"],
  withdrawn: ["m13.status.withdrawn", "neutral"],
  transferred_out: ["m13.status.transferredOut", "neutral"],
  graduated: ["m13.status.graduated", "info"],
  alumni: ["m13.status.alumni", "brand"],
};
const HEALTH_KIND: Readonly<Record<HealthFlagKind, Spec>> = {
  allergy: ["m13.healthKind.allergy", "danger"],
  medication: ["m13.healthKind.medication", "warning"],
  condition: ["m13.healthKind.condition", "warning"],
  dietary: ["m13.healthKind.dietary", "info"],
  accessibility: ["m13.healthKind.accessibility", "brand"],
  other: ["m13.healthKind.other", "neutral"],
};
const ENROLMENT_STATUS: Readonly<Record<EnrolmentStatus, Spec>> = {
  active: ["m13.enrolmentStatus.active", "success"],
  completed: ["m13.enrolmentStatus.completed", "info"],
  withdrawn: ["m13.enrolmentStatus.withdrawn", "neutral"],
};
const DOCUMENT_KIND: Readonly<Record<LearnerDocumentKind, MessageKey>> = {
  birth_certificate: "m13.documentKind.birthCertificate",
  id_proof: "m13.documentKind.idProof",
  transfer_certificate: "m13.documentKind.transferCertificate",
  photo: "m13.documentKind.photo",
  medical: "m13.documentKind.medical",
  previous_report: "m13.documentKind.previousReport",
  other: "m13.documentKind.other",
};
const ROW = "min-w-0 space-y-1 rounded-md border border-border-default bg-bg-raised p-3";
const TITLE = "break-words text-body font-medium text-text-primary";
const SUB = "break-words text-body-sm text-text-secondary";
const FLEX = "flex flex-wrap items-center gap-2";
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const hasStatus = (e: unknown, code: number) => e instanceof ApiRequestError && e.status === code;
const byName = <T extends { id: string; name: string }>(xs?: readonly T[]) =>
  new Map((xs ?? []).map((x) => [x.id, x.name]));
const pickLabel = (labels: Readonly<Record<string, string>>, loc: string, fallback: string) =>
  labels[loc] ??
  Object.entries(labels).find(([k]) => baseLanguage(k) === baseLanguage(loc))?.[1] ??
  Object.values(labels)[0] ??
  fallback;

export interface LearnerProfileProps {
  readonly learnerId: string;
  readonly onBack?: () => void;
}

/** Learner profile (M13, L1): details, enrolments, documents, guardians and returned fields. */
export function LearnerProfile({ learnerId, onBack }: LearnerProfileProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const safe = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const learner = useLearner(learnerId);
  const enrolments = useLearnerEnrolments(learnerId);
  const documents = useLearnerDocuments(learnerId);
  const people = usePeople();
  const customFields = useCustomFields("learner");
  const programs = usePrograms();
  const yearLevels = useYearLevels();
  const classGroups = useClassGroups();
  const retryBtn = (fn: () => Promise<unknown>, size?: "sm") => (
    <Button variant="secondary" size={size} onClick={() => void fn()}>
      {t("common.retry")}
    </Button>
  );
  const backBtn = onBack ? (
    <Button variant="ghost" size="sm" onClick={onBack}>
      <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden="true" />
      {t("m13.profile.back")}
    </Button>
  ) : null;
  if (learner.isPending && !learner.data) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        {backBtn}
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (learner.isError && !learner.data) {
    if (hasStatus(learner.error, 403)) return <Forbidden />;
    if (hasStatus(learner.error, 404)) {
      return (
        <EmptyState
          icon={<SearchX className="h-6 w-6" />}
          title={t("m13.profile.notFoundTitle")}
          description={t("m13.profile.notFoundBody")}
          action={backBtn}
        />
      );
    }
    return (
      <EmptyState tone="error" title={t("m13.profile.error")} action={retryBtn(learner.refetch)} />
    );
  }

  const record = learner.data;
  if (!record) return null;
  const peopleById = new Map((people.data?.items ?? []).map((p) => [p.id, p]));
  const fieldDefs = new Map((customFields.data?.items ?? []).map((d) => [d.key, d]));
  const progNames = byName(programs.data?.items);
  const levelNames = byName(yearLevels.data?.items);
  const groupNames = byName(classGroups.data?.items);
  const person = peopleById.get(record.personId);
  const fullName = person?.preferredName
    ? `${person.preferredName} (${person.legalName})`
    : (person?.legalName ?? record.learnerNumber);
  const [statusKey, statusTone] = LEARNER_STATUS[record.status];
  const fmtDate = (iso: string) => formatDate(iso, { locale: safe });
  const details: FieldRow[] = [
    [t("m13.profile.learnerNumber"), record.learnerNumber, true],
    [t("m13.profile.admissionDate"), fmtDate(record.admissionDate)],
  ];
  const addDetail = (k: MessageKey, v: string, mono?: boolean, ltr?: boolean) =>
    details.push([t(k), v, mono, ltr]);
  if (record.leftOn) addDetail("m13.profile.leftOn", fmtDate(record.leftOn));
  if (person?.dateOfBirth) addDetail("m13.profile.dateOfBirth", fmtDate(person.dateOfBirth));
  if (person?.email) addDetail("m13.profile.email", person.email);
  if (person?.phone) addDetail("m13.profile.phone", formatPhone(person.phone), true, true);
  const customRows: FieldRow[] = Object.entries(record.customFields)
    .filter(([, v]) => v !== null && v !== "" && (!Array.isArray(v) || v.length > 0))
    .map(([key, v]) => {
      const def = fieldDefs.get(key);
      const opt = (val: string) => {
        const o = def?.options?.find((x) => x.value === val);
        return o ? pickLabel(o.label, locale, val) : val;
      };
      let text = "";
      if (typeof v === "boolean") text = t(v ? "m13.customField.yes" : "m13.customField.no");
      else if (typeof v === "number") text = formatNumber(v, safe);
      else if (Array.isArray(v)) text = v.map(opt).join(", ");
      else if (typeof v === "string") {
        text = def?.options ? opt(v) : def?.type === "date" && ISO_DATE.test(v) ? fmtDate(v) : v;
      }
      return [def ? pickLabel(def.label, locale, key) : key, text];
    });
  const dlGrid = (rows: readonly FieldRow[]) => (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {rows.map(([label, value, mono, ltr]) => (
        <div key={label} className="min-w-0 space-y-1">
          <dt className={cn(SUB, "font-medium")}>{label}</dt>
          <dd
            dir={ltr ? "ltr" : undefined}
            className={cn(mono && "font-mono", "break-words text-body text-text-primary")}
          >
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
  const list = <T extends { readonly id: string }>(
    q: {
      isPending: boolean;
      isError: boolean;
      data?: { items: readonly T[] };
      refetch: () => Promise<unknown>;
    },
    err: MessageKey,
    empty: MessageKey,
    render: (item: T) => ReactNode,
  ) => {
    if (q.isPending && !q.data) return <Skeleton className="h-16 w-full" />;
    if (q.isError && !q.data) {
      return <EmptyState tone="error" title={t(err)} action={retryBtn(q.refetch, "sm")} />;
    }
    const items = q.data?.items ?? [];
    if (items.length === 0) return <p className="text-body-sm text-text-muted">{t(empty)}</p>;
    return <ul className="space-y-3">{items.map(render)}</ul>;
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        {backBtn}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="min-w-0 break-words font-sans text-page-title font-semibold text-text-primary">
            {fullName}
          </h1>
          <Badge tone={statusTone}>{t(statusKey)}</Badge>
        </div>
        <LastSynced updatedAt={learner.dataUpdatedAt} />
      </header>
      <Card title={t("m13.profile.detailsHeading")}>{dlGrid(details)}</Card>
      {record.healthFlags.length > 0 && (
        <Card title={t("m13.profile.healthFlagsHeading")}>
          <ul className="space-y-3">
            {record.healthFlags.map((flag, i) => (
              <li key={`${flag.kind}-${flag.label}-${i}`} className={ROW}>
                <div className={FLEX}>
                  <span className={TITLE}>{flag.label}</span>
                  <Badge tone={HEALTH_KIND[flag.kind][1]}>{t(HEALTH_KIND[flag.kind][0])}</Badge>
                </div>
                {flag.note !== null && <p className={SUB}>{flag.note}</p>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {customRows.length > 0 && (
        <Card title={t("m13.profile.customFieldsHeading")}>{dlGrid(customRows)}</Card>
      )}
      <Card title={t("m13.profile.enrolmentsHeading")}>
        {list(enrolments, "m13.profile.enrolmentsError", "m13.profile.enrolmentsEmpty", (e) => {
          const [ek, et] = ENROLMENT_STATUS[e.status];
          const from = fmtDate(e.effectiveFrom);
          const dates = e.effectiveTo
            ? t("m13.profile.effectiveRange", { from, to: fmtDate(e.effectiveTo) })
            : t("m13.profile.effectiveFrom", { date: from });
          const sub = [progNames.get(e.programId), e.yearLevelId && levelNames.get(e.yearLevelId)]
            .filter((p): p is string => Boolean(p))
            .join(" · ");
          const roll = e.rollNumber && t("m13.profile.rollNumber", { roll: e.rollNumber });
          return (
            <li key={e.id} className={ROW}>
              <div className={FLEX}>
                <span className={TITLE}>{groupNames.get(e.classGroupId) ?? e.classGroupId}</span>
                <Badge tone={et}>{t(ek)}</Badge>
              </div>
              {sub && <p className={SUB}>{sub}</p>}
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body-sm text-text-secondary">
                {roll && <span>{roll}</span>}
                <span>{dates}</span>
              </div>
            </li>
          );
        })}
      </Card>
      <Card title={t("m13.profile.documentsHeading")}>
        {list(documents, "m13.profile.documentsError", "m13.profile.documentsEmpty", (doc) => {
          const date = formatDate(doc.uploadedAt, { locale: safe, timeZone });
          const docStatus: MessageKey = doc.verified
            ? "m13.documentStatus.verified"
            : "m13.documentStatus.unverified";
          return (
            <li key={doc.id} className={ROW}>
              <div className={FLEX}>
                <FileText className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <span className={cn("min-w-0", TITLE)}>{doc.fileName}</span>
                <Badge tone="neutral">{t(DOCUMENT_KIND[doc.kind])}</Badge>
                <Badge tone={doc.verified ? "success" : "warning"}>{t(docStatus)}</Badge>
              </div>
              <p className={SUB}>{t("m13.profile.uploadedOn", { date })}</p>
            </li>
          );
        })}
      </Card>
      <Card title={t("m13.profile.guardiansHeading")}>
        <GuardianList
          learnerPersonId={record.personId}
          peopleById={peopleById}
          showPickups={false}
        />
      </Card>
    </div>
  );
}
