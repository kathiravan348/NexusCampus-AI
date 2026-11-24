import type { RoomKind } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { useBellSchedules, useRooms } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import { Clock, DoorOpen } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";

const ROOM_KIND_KEY: Readonly<Record<RoomKind, MessageKey>> = {
  classroom: "m16.roomKind.classroom",
  lab: "m16.roomKind.lab",
  hall: "m16.roomKind.hall",
  library: "m16.roomKind.library",
  sports: "m16.roomKind.sports",
  online: "m16.roomKind.online",
  other: "m16.roomKind.other",
};

/** Rooms catalogue and daily bell schedules (M16, L1). */
export function RoomsTab() {
  const t = useText();
  const { locale } = useRuntime();
  const rooms = useRooms();
  const schedules = useBellSchedules();

  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const loading = (rooms.isPending && !rooms.data) || (schedules.isPending && !schedules.data);
  const failed = (rooms.isError && !rooms.data) || (schedules.isError && !schedules.data);

  if (loading) {
    return (
      <div className="space-y-4" role="status" aria-label={t("common.loading")}>
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (failed) {
    return (
      <EmptyState
        tone="error"
        title={t("m16.rooms.error")}
        action={
          <Button
            variant="secondary"
            onClick={() => {
              void rooms.refetch();
              void schedules.refetch();
            }}
          >
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const roomList = rooms.data?.items ?? [];
  const scheduleList = schedules.data?.items ?? [];

  return (
    <div className="space-y-6">
      <Card title={t("m16.rooms.title")}>
        {roomList.length === 0 ? (
          <EmptyState icon={<DoorOpen className="h-6 w-6" />} title={t("m16.rooms.empty")} />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roomList.map((room) => (
              <li
                key={room.id}
                className="min-w-0 space-y-1.5 rounded-md border border-border-default bg-bg-raised p-3"
              >
                <p className="break-words text-body font-medium text-text-primary">{room.name}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{room.code}</Badge>
                  <Badge tone="info">{t(ROOM_KIND_KEY[room.kind])}</Badge>
                  {!room.active && <Badge tone="warning">{t("common.inactive")}</Badge>}
                </div>
                <p className="font-mono text-number-sm text-text-secondary tabular-nums">
                  {t("m16.rooms.capacity", {
                    value: room.capacity !== null ? formatNumber(room.capacity, safeLocale) : "—",
                  })}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title={t("m16.bells.title")}>
        {scheduleList.length === 0 ? (
          <EmptyState icon={<Clock className="h-6 w-6" />} title={t("m16.bells.empty")} />
        ) : (
          <div className="space-y-5">
            {scheduleList.map((schedule) => (
              <section key={schedule.id} className="space-y-2.5">
                <h3 className="font-sans text-body font-semibold text-text-primary">
                  {schedule.name}
                </h3>
                <ol className="space-y-2">
                  {schedule.periods.map((period) => (
                    <li
                      key={`${schedule.id}-${period.code}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-default bg-bg-raised px-3 py-2"
                    >
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className="break-words text-body font-medium text-text-primary">
                          {period.label}
                        </span>
                        {period.isBreak && <Badge tone="warning">{t("m16.bells.break")}</Badge>}
                      </div>
                      <span
                        dir="ltr"
                        className="shrink-0 font-mono text-number-sm text-text-secondary tabular-nums"
                      >
                        {t("m16.week.timeRange", { start: period.start, end: period.end })}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
