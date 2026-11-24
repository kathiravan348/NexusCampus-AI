import type { Address, Person } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { ApiRequestError, useHouseholds, usePeople } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { HeartHandshake, MapPin } from "lucide-react";
import { useMemo } from "react";
import { LastSynced } from "../../app/LastSynced";
import { Forbidden } from "../../pages/Forbidden";
import { GuardianList } from "./GuardianList";

function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403;
}

function personDisplayName(person: Person): string {
  return person.preferredName ? `${person.preferredName} (${person.legalName})` : person.legalName;
}

function formatAddress(address: Address): string {
  return [
    address.line1,
    address.line2,
    address.city,
    address.region,
    address.postalCode,
    address.countryCode,
  ]
    .filter((part): part is string => Boolean(part && part.trim().length > 0))
    .join(", ");
}

/**
 * Families & guardians (M14, L1): households scoped by role, household members resolved from M02
 * people, and per-learner guardian pickup rights and authorised pickups. Cached lists work offline.
 */
export function FamiliesPage() {
  const t = useText();
  const households = useHouseholds();
  const people = usePeople();

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const person of people.data?.items ?? []) {
      map.set(person.id, person);
    }
    return map;
  }, [people.data]);

  const loading = (households.isPending && !households.data) || (people.isPending && !people.data);

  if (households.isError && !households.data) {
    if (isForbidden(households.error)) return <Forbidden />;
    return (
      <EmptyState
        tone="error"
        title={t("m14.families.error")}
        action={
          <Button variant="secondary" onClick={() => void households.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const householdList = households.data?.items ?? [];

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m14.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m14.families.intro")}</p>
        <LastSynced updatedAt={households.dataUpdatedAt} />
      </header>

      {loading ? (
        <div className="space-y-4" role="status" aria-label={t("common.loading")}>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : householdList.length === 0 ? (
        <EmptyState
          icon={<HeartHandshake className="h-6 w-6" />}
          title={t("m14.families.empty")}
          description={t("m14.families.emptyBody")}
        />
      ) : (
        <ul aria-label={t("m14.families.listLabel")} className="space-y-6">
          {householdList.map((household) => (
            <li key={household.id} className="min-w-0">
              <Card title={<span className="break-words">{household.name}</span>} headingAs="h2">
                <div className="space-y-5">
                  {household.address !== null && (
                    <div
                      aria-label={t("m14.families.addressLabel")}
                      className="flex items-start gap-2 text-body-sm text-text-secondary"
                    >
                      <MapPin
                        className="mt-0.5 h-4 w-4 shrink-0 text-text-muted"
                        aria-hidden="true"
                      />
                      <p className="min-w-0 break-words">{formatAddress(household.address)}</p>
                    </div>
                  )}

                  <section className="space-y-2">
                    <h3 className="font-sans text-body font-semibold text-text-primary">
                      {t("m14.families.membersHeading")}
                    </h3>
                    <ul className="flex flex-wrap gap-2">
                      {household.guardianPersonIds.map((personId) => {
                        const person = peopleById.get(personId);
                        return (
                          <li
                            key={`guardian-${personId}`}
                            className="inline-flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border-default bg-bg-raised px-3 py-1.5"
                          >
                            <span className="break-words text-body-sm font-medium text-text-primary">
                              {person ? personDisplayName(person) : t("term.guardian")}
                            </span>
                            <Badge tone="info">{t("term.guardian")}</Badge>
                          </li>
                        );
                      })}
                      {household.learnerPersonIds.map((personId) => {
                        const person = peopleById.get(personId);
                        return (
                          <li
                            key={`learner-${personId}`}
                            className="inline-flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border-default bg-bg-raised px-3 py-1.5"
                          >
                            <span className="break-words text-body-sm font-medium text-text-primary">
                              {person ? personDisplayName(person) : t("term.learner")}
                            </span>
                            <Badge tone="brand">{t("term.learner")}</Badge>
                          </li>
                        );
                      })}
                    </ul>
                  </section>

                  <div className="space-y-4">
                    {household.learnerPersonIds.map((learnerPersonId) => {
                      const learnerPerson = peopleById.get(learnerPersonId);
                      const learnerLabel = learnerPerson
                        ? personDisplayName(learnerPerson)
                        : t("term.learner");
                      return (
                        <section
                          key={learnerPersonId}
                          className="min-w-0 space-y-3 rounded-md border border-border-default bg-bg-raised p-4"
                        >
                          <h3 className="break-words font-sans text-card-title font-semibold text-text-primary">
                            {learnerLabel}
                          </h3>
                          <GuardianList
                            learnerPersonId={learnerPersonId}
                            peopleById={peopleById}
                            showPickups
                            headingAs="h4"
                          />
                        </section>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default FamiliesPage;
