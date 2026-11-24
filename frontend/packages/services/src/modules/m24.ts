import {
  MeetingBookingSchema,
  MeetingSlotSchema,
  MessageThreadSchema,
  NoticeSchema,
  PAGE_SIZE_MAX,
  ThreadMessageSchema,
  pageSchema,
} from "@nexus/contracts";
import { queryKeys } from "../keys";
import { useScopedQuery } from "../query";

const all = { pageSize: PAGE_SIZE_MAX };
const MessageThreadPage = pageSchema(MessageThreadSchema);
const ThreadMessagePage = pageSchema(ThreadMessageSchema);
const NoticePage = pageSchema(NoticeSchema);
const MeetingSlotPage = pageSchema(MeetingSlotSchema);
const MeetingBookingPage = pageSchema(MeetingBookingSchema);

export function useMessageThreads() {
  return useScopedQuery(queryKeys.m24.messageThreads, (c, signal) =>
    c.get("/message-threads", MessageThreadPage, all, { signal }),
  );
}

export function useThreadMessages(threadId: string | null) {
  const endpoint = `/message-threads/${encodeURIComponent(threadId ?? "")}/messages`;
  return useScopedQuery(
    (scope) => queryKeys.m24.threadMessages(scope, threadId),
    (c, signal) => c.get(endpoint, ThreadMessagePage, all, { signal }),
    threadId !== null,
  );
}

export function useNotices() {
  return useScopedQuery(queryKeys.m24.notices, (c, signal) =>
    c.get("/notices", NoticePage, all, { signal }),
  );
}

export function useMeetingSlots(staffProfileId: string | null = null) {
  const filters = { ...all, staffProfileId };
  return useScopedQuery(
    (scope) => queryKeys.m24.meetingSlots(scope, staffProfileId),
    (c, signal) => c.get("/meeting-slots", MeetingSlotPage, filters, { signal }),
  );
}

export function useMeetingBookings() {
  return useScopedQuery(queryKeys.m24.meetingBookings, (c, signal) =>
    c.get("/meeting-bookings", MeetingBookingPage, all, { signal }),
  );
}
