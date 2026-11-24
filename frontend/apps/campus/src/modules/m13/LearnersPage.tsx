import type { Person } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { ApiRequestError, useLearners, usePeople } from "@nexus/services";
import { Badge, Button, EmptyState, Input, Skeleton } from "@nexus/ui-core";
import { GraduationCap, Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { LastSynced } from "../../app/LastSynced";
import { Forbidden } from "../../pages/Forbidden";
import { LEARNER_STATUS, LearnerProfile } from "./LearnerProfile";

function isForbidden(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 403;
}

function personDisplayName(person: Person): string {
  return person.preferredName ? `${person.preferredName} (${person.legalName})` : person.legalName;
}

/**
 * Learner records (M13, L1): searchable list of learners scoped by role, opening `LearnerProfile`
 * via the `?learner=` search param (the campus router mounts one exact route per module).
 */
export function LearnersPage() {
  const t = useText();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const learners = useLearners();
  const people = usePeople();

  const rawSelected = searchParams.get("learner")?.trim() ?? "";
  const selectedLearnerId = rawSelected.length > 0 ? rawSelected : null;

  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const person of people.data?.items ?? []) {
      map.set(person.id, person);
    }
    return map;
  }, [people.data]);

  const learnerList = useMemo(() => learners.data?.items ?? [], [learners.data]);
  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (query === "") return learnerList;
    return learnerList.filter((learner) => {
      const person = peopleById.get(learner.personId);
      return (
        learner.learnerNumber.toLowerCase().includes(query) ||
        (person?.legalName.toLowerCase().includes(query) ?? false) ||
        (person?.preferredName?.toLowerCase().includes(query) ?? false)
      );
    });
  }, [learnerList, peopleById, query]);

  if (selectedLearnerId !== null) {
    return (
      <LearnerProfile
        learnerId={selectedLearnerId}
        onBack={() => {
          setSearchParams({});
        }}
      />
    );
  }

  if (learners.isError && !learners.data) {
    if (isForbidden(learners.error)) return <Forbidden />;
    return (
      <EmptyState
        tone="error"
        title={t("m13.learners.error")}
        action={
          <Button variant="secondary" onClick={() => void learners.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const loading = (learners.isPending && !learners.data) || (people.isPending && !people.data);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m13.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m13.learners.intro")}</p>
        <LastSynced updatedAt={learners.dataUpdatedAt} />
      </header>

      {loading ? (
        <div className="space-y-3" role="status" aria-label={t("common.loading")}>
          <Skeleton className="h-10 w-full max-w-md" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : learnerList.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="h-6 w-6" />}
          title={t("m13.learners.empty")}
          description={t("m13.learners.emptyBody")}
        />
      ) : (
        <div className="space-y-4">
          <div className="max-w-md">
            <Input
              type="search"
              label={t("m13.learners.searchLabel")}
              placeholder={t("m13.learners.searchPlaceholder")}
              leading={<Search className="h-4 w-4" />}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-6 w-6" />}
              title={t("m13.learners.noMatches")}
              description={t("m13.learners.noMatchesBody")}
            />
          ) : (
            <ul aria-label={t("m13.learners.listLabel")} className="space-y-2">
              {filtered.map((learner) => {
                const person = peopleById.get(learner.personId);
                const [statusKey, statusTone] = LEARNER_STATUS[learner.status];
                return (
                  <li key={learner.id} className="min-w-0">
                    <Link
                      to={`/learners?learner=${encodeURIComponent(learner.id)}`}
                      className="flex flex-col gap-2 rounded-lg border border-border-default bg-bg-surface p-4 transition-colors hover:bg-bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-ground sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-0.5">
                        {person ? (
                          <>
                            <p className="break-words text-body font-semibold text-text-primary">
                              {personDisplayName(person)}
                            </p>
                            <p className="font-mono text-number-sm text-text-secondary">
                              {learner.learnerNumber}
                            </p>
                          </>
                        ) : (
                          <p className="font-mono text-body font-semibold text-text-primary">
                            {learner.learnerNumber}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <Badge tone={statusTone}>{t(statusKey)}</Badge>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default LearnersPage;
