import type { TimetableSlot } from "@nexus/contracts";
import { isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import {
  useClassGroups,
  useRooms,
  useSubjectOfferings,
  useSubjects,
  useTimetableSlots,
} from "@nexus/services";
import { Badge, Button, Card, EmptyState, Select, Skeleton } from "@nexus/ui-core";
import { CalendarClock, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { AddSlotDialog } from "./AddSlotDialog";

const TH_BASE = "border-e border-border-default px-3 py-2 text-start text-label font-semibold";
const SLOT_CARD = "min-w-0 space-y-1 rounded-md border border-border-default bg-bg-raised";

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/** Formats ISO weekday (1 = Monday … 7 = Sunday) using `Intl` in the active locale. */
export function formatWeekday(weekday: number, locale: string): string {
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  return new Intl.DateTimeFormat(safeLocale, { weekday: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(2024, 0, weekday, 12, 0, 0)),
  );
}

export function buildWeekdayOptions(locale: string) {
  return WEEKDAYS.map((day) => ({ value: String(day), label: formatWeekday(day, locale) }));
}

export interface WeekTabProps {
  readonly canManage: boolean;
  readonly online: boolean;
  readonly isStaff: boolean;
}

/** Class group weekly schedule: weekday × time grid at ≥ 768 px, stacked day lists below. */
export function WeekTab({ canManage, online, isStaff }: WeekTabProps) {
  const t = useText();
  const { locale } = useRuntime();
  const classGroups = useClassGroups();
  const offerings = useSubjectOfferings();
  const subjects = useSubjects();
  const rooms = useRooms();
  const allSlots = useTimetableSlots();
  const [chosenGroupId, setChosenGroupId] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const maps = useMemo(
    () => ({
      offerings: new Map((offerings.data?.items ?? []).map((o) => [o.id, o])),
      subjects: new Map((subjects.data?.items ?? []).map((s) => [s.id, s])),
      rooms: new Map((rooms.data?.items ?? []).map((r) => [r.id, r])),
      groups: new Map((classGroups.data?.items ?? []).map((g) => [g.id, g])),
    }),
    [offerings.data?.items, subjects.data?.items, rooms.data?.items, classGroups.data?.items],
  );

  const visibleGroups = useMemo(() => {
    const groups = classGroups.data?.items ?? [];
    if (isStaff) return groups;
    const allowedIds = new Set<string>();
    for (const slot of allSlots.data?.items ?? []) {
      const offering = maps.offerings.get(slot.subjectOfferingId);
      if (offering) allowedIds.add(offering.classGroupId);
    }
    return groups.filter((group) => allowedIds.has(group.id));
  }, [classGroups.data?.items, isStaff, allSlots.data?.items, maps.offerings]);

  const effectiveGroupId = visibleGroups.some((group) => group.id === chosenGroupId)
    ? chosenGroupId
    : (visibleGroups[0]?.id ?? null);
  const slots = useTimetableSlots(effectiveGroupId);

  const loading =
    (classGroups.isPending && !classGroups.data) ||
    (offerings.isPending && !offerings.data) ||
    (subjects.isPending && !subjects.data) ||
    (!isStaff && allSlots.isPending && !allSlots.data);
  const failed =
    (classGroups.isError && !classGroups.data) ||
    (offerings.isError && !offerings.data) ||
    (subjects.isError && !subjects.data);

  const slotList = useMemo(
    () => (effectiveGroupId === null ? [] : (slots.data?.items ?? [])),
    [effectiveGroupId, slots.data?.items],
  );
  const weekdays = useMemo(
    () => [...new Set(slotList.map((slot) => slot.weekday))].sort((a, b) => a - b),
    [slotList],
  );
  const timeBands = useMemo(() => {
    const bands = new Map<string, { readonly start: string; readonly end: string }>();
    for (const s of slotList) bands.set(`${s.start}-${s.end}`, { start: s.start, end: s.end });
    return [...bands.values()].sort(
      (a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end),
    );
  }, [slotList]);

  const renderSlotBody = (slot: TimetableSlot) => {
    const off = maps.offerings.get(slot.subjectOfferingId);
    const subjectName = (off && maps.subjects.get(off.subjectId)?.name) ?? slot.subjectOfferingId;
    const roomLabel =
      (slot.roomId !== null ? maps.rooms.get(slot.roomId)?.code : undefined) ??
      t("m16.week.noRoom");
    return (
      <>
        <p className="break-words text-body-sm font-medium text-text-primary">{subjectName}</p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span dir="ltr" className="font-mono text-number-sm text-text-secondary tabular-nums">
            {t("m16.week.timeRange", { start: slot.start, end: slot.end })}
          </span>
          <Badge tone="neutral">{roomLabel}</Badge>
        </div>
      </>
    );
  };

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (failed) {
    return (
      <EmptyState
        tone="error"
        title={t("m16.week.error")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void classGroups.refetch();
              void offerings.refetch();
              void subjects.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {visibleGroups.length > 0 && (
          <Select
            label={t("m16.week.classGroup")}
            options={visibleGroups.map((g) => ({ value: g.id, label: `${g.name} (${g.code})` }))}
            value={effectiveGroupId ?? ""}
            onChange={(event) => setChosenGroupId(event.target.value)}
            containerClassName="w-full sm:w-64"
          />
        )}
        {canManage && (
          <div className="flex flex-wrap items-center gap-3">
            {!online && (
              <p id="m16-add-offline-hint" className="text-body-sm text-text-secondary">
                {t("common.offline")}
              </p>
            )}
            <Button
              onClick={() => setAddOpen(true)}
              disabled={!online}
              title={!online ? t("common.offline") : undefined}
              aria-describedby={!online ? "m16-add-offline-hint" : undefined}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {t("m16.week.addSlot")}
            </Button>
          </div>
        )}
      </div>

      {visibleGroups.length === 0 ? (
        <EmptyState icon={<CalendarClock className="h-6 w-6" />} title={t("m16.week.noGroups")} />
      ) : slots.isPending && !slots.data ? (
        <Skeleton className="h-48 w-full" />
      ) : slots.isError && !slots.data ? (
        <EmptyState
          tone="error"
          title={t("m16.week.error")}
          action={
            <Button variant="secondary" onClick={() => void slots.refetch()}>
              {t("common.retry")}
            </Button>
          }
        />
      ) : slotList.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-6 w-6" />}
          title={t("m16.week.empty")}
          description={t("m16.week.emptyBody")}
        />
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-lg border border-border-default bg-bg-surface md:block">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">{t("m16.week.gridCaption")}</caption>
              <thead>
                <tr className="border-b border-border-default bg-bg-raised">
                  <th scope="col" className={`${TH_BASE} text-text-secondary`}>
                    {t("m16.week.timeColumn")}
                  </th>
                  {weekdays.map((day) => (
                    <th
                      key={day}
                      scope="col"
                      className={`${TH_BASE} text-text-primary last:border-e-0`}
                    >
                      {formatWeekday(day, locale)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {timeBands.map((band) => (
                  <tr
                    key={`${band.start}-${band.end}`}
                    className="border-b border-border-default last:border-b-0"
                  >
                    <th
                      scope="row"
                      className="whitespace-nowrap border-e border-border-default bg-bg-raised px-3 py-2.5 text-start font-mono text-number-sm font-medium text-text-secondary tabular-nums"
                    >
                      <span dir="ltr">
                        {t("m16.week.timeRange", { start: band.start, end: band.end })}
                      </span>
                    </th>
                    {weekdays.map((day) => {
                      const matches = slotList.filter(
                        (s) => s.weekday === day && s.start === band.start && s.end === band.end,
                      );
                      return (
                        <td
                          key={day}
                          className="border-e border-border-default p-2 align-top last:border-e-0"
                        >
                          {matches.length > 0 && (
                            <div className="space-y-1.5">
                              {matches.map((slot) => (
                                <div key={slot.id} className={`${SLOT_CARD} p-2`}>
                                  {renderSlotBody(slot)}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-4 md:hidden" data-testid="week-mobile-list">
            {weekdays.map((day) => (
              <Card key={day} title={formatWeekday(day, locale)}>
                <ul className="space-y-2">
                  {slotList
                    .filter((slot) => slot.weekday === day)
                    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end))
                    .map((slot) => (
                      <li key={slot.id} className={`${SLOT_CARD} p-3`}>
                        {renderSlotBody(slot)}
                      </li>
                    ))}
                </ul>
              </Card>
            ))}
          </div>
        </>
      )}

      {canManage && (
        <AddSlotDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          online={online}
          selectedClassGroupId={effectiveGroupId}
          offerings={offerings.data?.items ?? []}
          subjectsById={maps.subjects}
          classGroupsById={maps.groups}
          rooms={rooms.data?.items ?? []}
        />
      )}
    </div>
  );
}
