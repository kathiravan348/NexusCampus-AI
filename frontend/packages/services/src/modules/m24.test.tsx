import { MESSAGE_THREAD } from "@nexus/mocks";
import { renderHook, waitFor } from "@testing-library/react";
import {
  useMeetingBookings,
  useMeetingSlots,
  useMessageThreads,
  useNotices,
  useThreadMessages,
} from "../index";
import { ADMIN, freshDb, signInAs, startMockServer, wrapper } from "../test-utils";

startMockServer();

describe("M24 hooks", () => {
  it("loads message threads, thread messages, notices, slots and bookings", async () => {
    signInAs(ADMIN);
    const threadId = MESSAGE_THREAD.ls[1];
    const { result } = renderHook(
      () => ({
        threads: useMessageThreads(),
        messages: useThreadMessages(threadId),
        notices: useNotices(),
        slots: useMeetingSlots(),
        bookings: useMeetingBookings(),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );

    await waitFor(() => {
      expect(result.current.threads.data).toMatchObject({ total: 1, items: [{ id: threadId }] });
      expect(result.current.messages.data).toMatchObject({
        total: 2,
        items: [{ threadId }, { threadId }],
      });
      expect(result.current.notices.data?.total).toBe(2);
      expect(result.current.slots.data?.total).toBe(2);
      expect(result.current.bookings.data?.total).toBe(1);
    });
  });
});
