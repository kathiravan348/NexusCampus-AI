import type { ApplicationStatus } from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import {
  ApiRequestError,
  useApplications,
  usePeople,
  usePrograms,
  useTenant,
} from "@nexus/services";
import { Badge, Button, EmptyState, Skeleton } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

const APPLICATION_STATUS_KEYS: Readonly<Record<ApplicationStatus, MessageKey>> = {
  draft: "m12.status.draft",
  submitted: "m12.status.submitted",
  under_review: "m12.status.underReview",
  test_scheduled: "m12.status.testScheduled",
  offered: "m12.status.offered",
  waitlisted: "m12.status.waitlisted",
  accepted: "m12.status.accepted",
  rejected: "m12.status.rejected",
  withdrawn: "m12.status.withdrawn",
  enrolled: "m12.status.enrolled",
};

export function ApplicationsTab() {
  const t = useText();
  const { locale } = useRuntime();
  const tenant = useTenant();
  const displayLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const applications = useApplications();
  const people = usePeople();
  const programs = usePrograms();

  if (applications.isError) {
    return (
      <EmptyState
        tone="error"
        title={t(
          applications.error instanceof ApiRequestError &&
            ["forbidden", "module_disabled"].includes(applications.error.error.code)
            ? "common.shell.forbiddenTitle"
            : "m12.page.error",
        )}
        action={
          <Button variant="secondary" onClick={() => void applications.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!applications.data) return <Skeleton className="h-32 w-full" />;
  if (!applications.data.items.length) return <EmptyState title={t("m12.applications.empty")} />;

  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {applications.data.items.map((row) => {
        const applicant = people.data?.items.find((person) => person.id === row.applicantPersonId);
        const program = programs.data?.items.find((item) => item.id === row.programId);
        const institution = tenant.data?.institutions.find((item) => item.id === row.institutionId);
        return (
          <li
            key={row.id}
            className="min-w-0 space-y-2 break-words rounded-md border border-border-default bg-bg-raised p-4"
          >
            <h2 className="text-body font-semibold">{row.applicationNumber}</h2>
            {applicant && <p>{applicant.legalName}</p>}
            {program && <p>{program.name}</p>}
            <Badge tone="info">{t(APPLICATION_STATUS_KEYS[row.status])}</Badge>
            {row.submittedAt && institution && (
              <p>
                {t("m12.applications.submitted", {
                  date: formatDate(row.submittedAt, {
                    locale: displayLocale,
                    timeZone: institution.locale.timeZone,
                  }),
                })}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
