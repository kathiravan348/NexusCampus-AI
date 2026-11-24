import {
  MeetingBookingSchema,
  MeetingSlotSchema,
  MessageThreadSchema,
  NoticeSchema,
  PAGE_SIZE_MAX,
  ThreadMessageSchema,
  pageSchema,
  type Page,
  type ThreadMessage,
  type ThreadMessageInput,
} from "@nexus/contracts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiRequestError } from "../client";
import { queryKeys, type KeyScope } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery } from "../query";
import { useSession } from "../session";

const all = { pageSize: PAGE_SIZE_MAX };
const MessageThreadPage = pageSchema(MessageThreadSchema);
const ThreadMessagePage = pageSchema(ThreadMessageSchema);
const NoticePage = pageSchema(NoticeSchema);
const MeetingSlotPage = pageSchema(MeetingSlotSchema);
const MeetingBookingPage = pageSchema(MeetingBookingSchema);

export function useMessageThreads(enabled = true) {
  return useScopedQuery(
    queryKeys.m24.messageThreads,
    (c, signal) => c.get("/message-threads", MessageThreadPage, all, { signal }),
    enabled,
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

interface MessageWrite extends KeyScope {
  readonly threadId: string;
  readonly clientId: string;
  readonly input: ThreadMessageInput;
}

export interface LocalThreadMessage extends MessageWrite {
  readonly state: "sending" | "queued" | "failed";
}

function pendingKey(scope: KeyScope, threadId: string | null) {
  return [...queryKeys.m24.threadMessages(scope, threadId), "pending"];
}

export function useSendThreadMessage(threadId: string | null) {
  const { session } = useSession();
  const qc = useQueryClient();
  const pending = useQuery<LocalThreadMessage[]>({
    queryKey: session ? pendingKey(session, threadId) : ["signed-out", "messages-pending"],
    queryFn: () => [],
    enabled: false,
    gcTime: Infinity,
  });

  const mutation = useOutboxMutation<MessageWrite, ThreadMessage>({
    moduleId: "M24",
    operation: "messages.send",
    mergeRule: "append-only",
    priority: "normal",
    send: async (client, write, idempotencyKey) => {
      // Replay into the thread stored with the write, even if another thread is now open.
      if (!session || session.tenantId !== write.tenantId || session.userId !== write.userId) {
        throw new Error("Account changed");
      }
      const local = pendingKey(write, write.threadId);
      let message: ThreadMessage;
      try {
        message = await client.send(
          "POST",
          `/message-threads/${encodeURIComponent(write.threadId)}/messages`,
          write.input,
          ThreadMessageSchema,
          { headers: idempotencyHeaders(idempotencyKey) },
        );
      } catch (error) {
        if (
          error instanceof ApiRequestError &&
          error.status >= 400 &&
          error.status < 500 &&
          error.status !== 429
        ) {
          qc.setQueryData<LocalThreadMessage[]>(local, (rows) =>
            rows?.map((row) =>
              row.clientId === write.clientId ? { ...row, state: "failed" } : row,
            ),
          );
        }
        throw error;
      }
      const messagesKey = queryKeys.m24.threadMessages(write, write.threadId);
      if (qc.getQueryData(messagesKey)) {
        await qc.cancelQueries({ queryKey: messagesKey, exact: true });
        qc.setQueryData<Page<ThreadMessage>>(messagesKey, (previous) => {
          if (!previous || previous.items.some((item) => item.id === message.id)) return previous;
          return { ...previous, items: [...previous.items, message], total: previous.total + 1 };
        });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: messagesKey, exact: true }),
        qc.invalidateQueries({ queryKey: queryKeys.m24.messageThreads(write), exact: true }),
      ]);
      qc.setQueryData<LocalThreadMessage[]>(local, (rows) =>
        rows?.filter((row) => row.clientId !== write.clientId),
      );
      return message;
    },
  });

  async function sendMessage(input: ThreadMessageInput) {
    if (!session || !threadId) throw new Error("Message thread required");
    const write: MessageWrite = {
      tenantId: session.tenantId,
      userId: session.userId,
      threadId,
      clientId: crypto.randomUUID(),
      input,
    };
    const key = pendingKey(session, threadId);
    qc.setQueryData<LocalThreadMessage[]>(key, (rows) => [
      ...(rows ?? []),
      { ...write, state: "sending" },
    ]);
    try {
      const result = await mutation.mutateAsync(write);
      if (result.queued) {
        // A fast reconnect may already have replayed and removed this write.
        qc.setQueryData<LocalThreadMessage[]>(key, (rows) =>
          rows?.map((row) =>
            row.clientId === write.clientId && row.state === "sending"
              ? { ...row, state: "queued" }
              : row,
          ),
        );
      }
      return result;
    } catch (error) {
      qc.setQueryData<LocalThreadMessage[]>(key, (rows) =>
        rows?.filter((row) => row.clientId !== write.clientId),
      );
      throw error;
    }
  }

  const rows = pending.data ?? [];
  return {
    sendMessage,
    pendingMessages: rows.filter((row) => row.state === "queued" || row.state === "failed"),
    replayFailed: rows.some((row) => row.state === "failed"),
  };
}
