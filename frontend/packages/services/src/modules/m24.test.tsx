import { MESSAGE_THREAD, mockDb } from "@nexus/mocks";
import { act, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import {
  useMeetingBookings,
  useMeetingSlots,
  useMessageThreads,
  useNotices,
  useSendThreadMessage,
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

  it("sends an online reply and refreshes thread messages and thread order", async () => {
    signInAs(ADMIN);
    const threadId = MESSAGE_THREAD.ls[1];
    const { result } = renderHook(
      () => ({
        threads: useMessageThreads(),
        messages: useThreadMessages(threadId),
        write: useSendThreadMessage(threadId),
      }),
      { wrapper: wrapper({ db: freshDb() }) },
    );
    await waitFor(() => expect(result.current.messages.isSuccess).toBe(true));
    const before = result.current.messages.data!.total;
    const previousLast = result.current.threads.data!.items[0]!.lastMessageAt;

    let sentAt = "";
    await act(async () => {
      const res = await result.current.write.sendMessage({ body: "Online follow-up" });
      expect(res.queued).toBe(false);
      if (!res.queued) sentAt = res.data.sentAt;
    });

    await waitFor(() => expect(result.current.messages.data?.total).toBe(before + 1));
    expect(result.current.messages.data?.items.at(-1)?.body).toBe("Online follow-up");
    await waitFor(() => {
      expect(result.current.threads.data?.items[0]?.lastMessageAt).toBe(sentAt);
      expect(result.current.threads.data?.items[0]?.lastMessageAt).not.toBe(previousLast);
    });
    expect(result.current.write.pendingMessages).toHaveLength(0);
  });

  it("replays a queued offline reply once into its original thread after switching", async () => {
    signInAs(ADMIN);
    const threadId = MESSAGE_THREAD.ls[1];
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      const { result, rerender } = renderHook(
        ({ selected }) => ({
          threads: useMessageThreads(),
          messages: useThreadMessages(threadId),
          write: useSendThreadMessage(selected),
        }),
        {
          initialProps: { selected: threadId as string | null },
          wrapper: wrapper({ db: freshDb() }),
        },
      );
      await waitFor(() => expect(result.current.messages.isSuccess).toBe(true));
      const count = result.current.messages.data!.total;

      online.mockReturnValue(false);
      await act(async () => {
        const res = await result.current.write.sendMessage({ body: "Queued offline reply" });
        expect(res.queued).toBe(true);
      });
      await waitFor(() => expect(result.current.write.pendingMessages).toHaveLength(1));
      expect(result.current.write.pendingMessages[0]?.state).toBe("queued");
      expect(result.current.messages.data?.total).toBe(count);

      rerender({ selected: null });
      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => expect(result.current.messages.data?.total).toBe(count + 1));
      expect(result.current.messages.data?.items.at(-1)).toMatchObject({
        threadId,
        body: "Queued offline reply",
      });
      expect(mockDb.threadMessages.filter((row) => row.threadId === threadId)).toHaveLength(
        count + 1,
      );

      rerender({ selected: threadId });
      await waitFor(() => expect(result.current.write.pendingMessages).toHaveLength(0));
    } finally {
      online.mockRestore();
    }
  });

  it("marks a queued reply as failed when replay returns 409 for an archived thread", async () => {
    signInAs(ADMIN);
    const threadId = MESSAGE_THREAD.ls[1];
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      const { result } = renderHook(
        () => ({
          messages: useThreadMessages(threadId),
          write: useSendThreadMessage(threadId),
        }),
        { wrapper: wrapper({ db: freshDb() }) },
      );
      await waitFor(() => expect(result.current.messages.isSuccess).toBe(true));

      online.mockReturnValue(false);
      await act(async () => {
        const res = await result.current.write.sendMessage({ body: "Reply before archive" });
        expect(res.queued).toBe(true);
      });
      await waitFor(() => expect(result.current.write.pendingMessages).toHaveLength(1));

      mockDb.messageThreads.find((row) => row.id === threadId)!.archived = true;
      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => expect(result.current.write.replayFailed).toBe(true));
      expect(result.current.write.pendingMessages[0]?.state).toBe("failed");
    } finally {
      online.mockRestore();
    }
  });
});
