import type { Person, RoleProfile, SubjectOffering, TeacherLoad } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText, type Translate } from "@nexus/i18n";
import { ApiRequestError, useMe, usePeople, useTeacherLoad } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { ShieldX, Users } from "lucide-react";
import { useMemo } from "react";
import { useRuntime } from "../../app/TenantRuntime";

const STAFF_PROFILE_PREFIX = /^rp-(.+)-staff$/;

function formatPersonName(person: Person): string {
  return person.preferredName ? `${person.preferredName} (${person.legalName})` : person.legalName;
}

/**
 * Resolves a staff role profile ID to a display name only from people returned by `usePeople()`
 * (respecting `GET /people` directory visibility in `m02.ts`).
 */
export function resolveStaffName(
  staffProfileId: string,
  peopleById: ReadonlyMap<string, Person>,
  ownProfiles: readonly RoleProfile[],
): string | null {
  const own = ownProfiles.find((profile) => profile.id === staffProfileId);
  if (own) {
    const self = peopleById.get(own.personId);
    if (self) return formatPersonName(self);
  }
  const direct = peopleById.get(staffProfileId);
  if (direct) return formatPersonName(direct);
  const match = STAFF_PROFILE_PREFIX.exec(staffProfileId);
  if (match?.[1]) {
    const person = peopleById.get(`per-${match[1]}`);
    if (person) return formatPersonName(person);
  }
  return null;
}

/** Builds unique selectable staff options from teacher load and subject offerings. */
export function buildStaffOptions(
  loads: readonly TeacherLoad[],
  offerings: readonly SubjectOffering[],
  people: readonly Person[],
  selfPerson: Person | undefined,
  ownProfiles: readonly RoleProfile[],
  t: Translate,
): readonly { readonly id: string; readonly label: string }[] {
  const peopleById = new Map<string, Person>();
  for (const person of people) peopleById.set(person.id, person);
  if (selfPerson) peopleById.set(selfPerson.id, selfPerson);
  const ids = new Set<string>();
  for (const row of loads) ids.add(row.staffProfileId);
  for (const offering of offerings) {
    for (const id of offering.staffProfileIds) ids.add(id);
  }
  return [...ids].map((id, index) => ({
    id,
    label:
      resolveStaffName(id, peopleById, ownProfiles) ?? t("m16.load.staff", { number: index + 1 }),
  }));
}

/** Hook returning deduplicated selectable staff options for the Add Slot dialog. */
export function useStaffOptions(offerings: readonly SubjectOffering[]) {
  const t = useText();
  const me = useMe();
  const people = usePeople();
  const load = useTeacherLoad();
  return useMemo(
    () =>
      buildStaffOptions(
        load.data?.items ?? [],
        offerings,
        people.data?.items ?? [],
        me.data?.person,
        me.data?.roleProfiles ?? [],
        t,
      ),
    [load.data?.items, offerings, people.data?.items, me.data, t],
  );
}

/** Staff-only weekly teaching load summary (M16, L1). */
export function LoadTab() {
  const t = useText();
  const { locale } = useRuntime();
  const me = useMe();
  const people = usePeople();
  const load = useTeacherLoad();

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const peopleById = useMemo(() => {
    const map = new Map<string, Person>();
    for (const person of people.data?.items ?? []) {
      map.set(person.id, person);
    }
    if (me.data?.person) map.set(me.data.person.id, me.data.person);
    return map;
  }, [people.data?.items, me.data?.person]);

  if (load.isPending && !load.data) {
    return (
      <div className="space-y-3" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (load.isError && !load.data) {
    if (load.error instanceof ApiRequestError && load.error.status === 403) {
      return (
        <EmptyState
          icon={<ShieldX className="h-6 w-6" />}
          title={t("common.shell.forbiddenTitle")}
          description={t("common.shell.forbiddenBody")}
        />
      );
    }
    return (
      <EmptyState
        tone="error"
        title={t("m16.load.error")}
        action={
          <Button variant="secondary" onClick={() => void load.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const rows = load.data?.items ?? [];
  const ownProfiles = me.data?.roleProfiles ?? [];

  return (
    <Card title={t("m16.load.title")}>
      {rows.length === 0 ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title={t("m16.load.empty")} />
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => {
            const label =
              resolveStaffName(row.staffProfileId, peopleById, ownProfiles) ??
              t("m16.load.staff", { number: index + 1 });
            return (
              <li
                key={`${row.staffProfileId}-${row.academicYearId}-${row.periodId ?? "all"}`}
                className="flex flex-col gap-2 rounded-md border border-border-default bg-bg-raised p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-words text-body font-medium text-text-primary">{label}</p>
                    {row.overloaded && <Badge tone="danger">{t("m16.load.overloaded")}</Badge>}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-number-sm text-text-secondary tabular-nums">
                    <span>{t("m16.load.periods", { count: row.weeklyPeriods })}</span>
                    <span>
                      {t("m16.load.minutes", {
                        count: formatNumber(row.weeklyMinutes, safeLocale),
                      })}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-body-sm text-text-secondary">
                  {row.maxWeeklyPeriods !== null
                    ? t("m16.load.maxPeriods", {
                        max: formatNumber(row.maxWeeklyPeriods, safeLocale),
                      })
                    : t("m16.load.noLimit")}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
