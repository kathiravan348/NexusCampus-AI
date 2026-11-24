import type { MeetingBookingStatus, MeetingMode } from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { useLearners, useMeetingBookings, useMeetingSlots, usePeople } from "@nexus/services";
import { Badge, Button, EmptyState, type BadgeProps } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

type BadgeTone = NonNullable<BadgeProps["tone"]>;

const MEETING_MODE_KEYS: Readonly<Record<MeetingMode, MessageKey>> = {
  in_person: "m24.meetingMode.inPerson",
  video: "m24.meetingMode.video",
  phone: "m24.meetingMode.phone",
};

const BOOKING_STATUS: Readonly<Record<MeetingBookingStatus, readonly [MessageKey, BadgeTone]>> = {
  booked: ["m24.bookingStatus.booked", "info"],
  cancelled: ["m24.bookingStatus.cancelled", "neutral"],
  attended: ["m24.bookingStatus.attended", "success"],
  no_show: ["m24.bookingStatus.noShow", "warning"],
};

export function MeetingsTab() {
  const t = useText();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const bookings = useMeetingBookings();
  const slots = useMeetingSlots();
  const learners = useLearners();
  const people = usePeople();

  if (bookings.isError && !bookings.data) {
    return (
      <EmptyState
        tone="error"
        title={t("m24.meetings.error")}
        action={
          <Button className="min-h-11" variant="secondary" onClick={() => void bookings.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!bookings.data || (!slots.data && !slots.isError)) {
    return <p role="status">{t("common.loading")}</p>;
  }

  const slotById = new Map(
    (slots.isError ? [] : slots.data?.items)?.map((slot) => [slot.id, slot]),
  );
  const personNames = new Map(
    (people.isError ? [] : people.data?.items)?.map((person) => [
      person.id,
      person.preferredName || person.legalName,
    ]),
  );
  const learnerLabels = new Map<string, string>();
  if (!learners.isError) {
    for (const learner of learners.data?.items ?? []) {
      learnerLabels.set(learner.id, personNames.get(learner.personId) || learner.learnerNumber);
    }
  }

  const sorted = [...bookings.data.items].sort((a, b) => {
    const slotA = slotById.get(a.slotId);
    const slotB = slotById.get(b.slotId);
    const dateCompare = (slotA?.date ?? "").localeCompare(slotB?.date ?? "");
    if (dateCompare !== 0) return dateCompare;
    const startCompare = (slotA?.start ?? "").localeCompare(slotB?.start ?? "");
    if (startCompare !== 0) return startCompare;
    return a.id.localeCompare(b.id);
  });

  if (sorted.length === 0) {
    return <EmptyState title={t("m24.meetings.empty")} />;
  }

  return (
    <ul aria-label={t("m24.meetings.listLabel")} className="space-y-3">
      {sorted.map((booking) => {
        const slot = slotById.get(booking.slotId);
        const [statusKey, statusTone] = BOOKING_STATUS[booking.status];
        const learnerName = learnerLabels.get(booking.learnerId) ?? t("term.learner");
        const slotDate = slot ? formatDate(slot.date, { locale: safeLocale }) : null;
        return (
          <li
            key={booking.id}
            className="min-w-0 space-y-2 rounded-lg border border-border-default bg-bg-surface p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <p className="break-words font-semibold text-text-primary">{learnerName}</p>
                {slot && slotDate ? (
                  <p className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
                    <time dateTime={slot.date}>{slotDate}</time>
                    <span>{t("m24.meetings.timeRange", { start: slot.start, end: slot.end })}</span>
                  </p>
                ) : (
                  <p className="text-body-sm text-text-secondary">
                    {t("m24.meetings.slotUnavailable")}
                  </p>
                )}
              </div>
              <Badge tone={statusTone}>{t(statusKey)}</Badge>
            </div>
            {slot && (
              <div className="flex flex-wrap items-center gap-2 text-body-sm text-text-secondary">
                <span>{t(MEETING_MODE_KEYS[slot.mode])}</span>
                {slot.location && <span className="break-words">{slot.location}</span>}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
