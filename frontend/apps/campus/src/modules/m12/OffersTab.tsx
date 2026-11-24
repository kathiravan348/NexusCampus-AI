import { formatDate, formatNumber, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import {
  ApiRequestError,
  useAdmissionOffers,
  useApplications,
  useClassGroups,
  usePrograms,
  useWaitlist,
} from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

export function OffersTab() {
  const t = useText();
  const { locale } = useRuntime();
  const displayLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const offers = useAdmissionOffers();
  const waitlist = useWaitlist();
  const applications = useApplications();
  const groups = useClassGroups();
  const programs = usePrograms();
  const failed = [offers, waitlist, applications].find((query) => query.isError);
  if (failed) {
    return (
      <EmptyState
        tone="error"
        title={t(
          failed.error instanceof ApiRequestError &&
            ["forbidden", "module_disabled"].includes(failed.error.error.code)
            ? "common.shell.forbiddenTitle"
            : "m12.page.error",
        )}
        action={
          <Button variant="secondary" onClick={() => void failed.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!offers.data || !waitlist.data || !applications.data)
    return <Skeleton className="h-32 w-full" />;
  const numbers = new Map(applications.data.items.map((row) => [row.id, row.applicationNumber]));
  const ordered = [...waitlist.data.items].sort((a, b) => a.position - b.position);

  return (
    <div className="space-y-6">
      <Card title={t("m12.offers.title")}>
        {offers.data.items.length === 0 ? (
          <EmptyState title={t("m12.offers.empty")} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {offers.data.items.map((row) => {
              const group = groups.data?.items.find((item) => item.id === row.classGroupId);
              return (
                <li
                  key={row.id}
                  className="min-w-0 space-y-2 break-words rounded-md border border-border-default bg-bg-raised p-4"
                >
                  <p className="font-semibold">{numbers.get(row.applicationId)}</p>
                  {group && <p>{group.name}</p>}
                  <Badge tone="info">{t(`m12.status.${row.status}`)}</Badge>
                  <p>
                    {t("m12.offers.expires", {
                      date: formatDate(row.expiresOn, { locale: displayLocale, timeZone: "UTC" }),
                    })}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={t("m12.waitlist.title")}>
        {ordered.length === 0 ? (
          <EmptyState title={t("m12.waitlist.empty")} />
        ) : (
          <ol className="space-y-2">
            {ordered.map((row) => (
              <li
                key={row.id}
                className="min-w-0 space-y-2 break-words rounded-md border border-border-default bg-bg-raised p-4"
              >
                <p>
                  {t("m12.waitlist.position", {
                    position: formatNumber(row.position, displayLocale),
                  })}
                </p>
                <p className="font-semibold">{numbers.get(row.applicationId)}</p>
                <p>{programs.data?.items.find((item) => item.id === row.programId)?.name}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
