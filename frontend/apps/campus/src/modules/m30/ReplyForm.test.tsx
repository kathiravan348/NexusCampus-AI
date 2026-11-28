import {
  COURSE_SPACE,
  DISCUSSION_THREAD,
  TENANT,
  USER,
  mockDb,
  type DemoPersona,
} from "@nexus/mocks";
import { listOutbox } from "@nexus/offline";
import { createNexusQueryClient } from "@nexus/services";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { ReplyForm } from "./ReplyForm";

function renderForm(options?: {
  readonly threadId?: string;
  readonly parentPostId?: string | null;
}) {
  const who: DemoPersona = {
    ...persona(TENANT.riverside, "teacher"),
    userId: USER.rvAmira,
  };
  signInAs(who);
  const db = freshDb();
  const onSuccess = vi.fn();

  const view = render(
    <AppProviders
      db={db}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <ReplyForm
        threadId={options?.threadId ?? DISCUSSION_THREAD.rvMathQna}
        courseSpaceId={COURSE_SPACE.rvY5Math}
        parentPostId={options?.parentPostId ?? null}
        onSuccess={onSuccess}
      />
    </AppProviders>,
  );

  return { ...view, db, who, onSuccess };
}

describe("ReplyForm (M30)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("validates empty and too-long reply bodies with Zod", async () => {
    renderForm();
    const input = await screen.findByLabelText(/^Reply to thread/);

    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));
    expect(await screen.findByText("Write a reply before posting.")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "a".repeat(5001) } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));
    const tooLong = await screen.findByText("Reply must be 5,000 characters or fewer.");
    expect(tooLong).toBeInTheDocument();
  });

  it("posts a reply online and clears the input", async () => {
    const { onSuccess } = renderForm();
    const input = (await screen.findByLabelText(/^Reply to thread/)) as HTMLTextAreaElement;

    fireEvent.change(input, { target: { value: "Great explanation!" } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(input.value).toBe("");
    expect(mockDb.discussionPosts.some((post) => post.body === "Great explanation!")).toBe(true);
  });

  it("queues a reply in the offline outbox and shows the queued notice in the form", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { db, who } = renderForm();
    const input = await screen.findByLabelText(/^Reply to thread/);

    onlineSpy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(
      await screen.findByText("You are offline. Posting will queue your reply to sync later."),
    ).toBeInTheDocument();

    const form = input.closest("form")!;
    fireEvent.change(input, { target: { value: "Offline queued reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    expect(
      await within(form).findByText("Reply queued offline. It will sync when you reconnect."),
    ).toBeInTheDocument();

    const queued = await listOutbox(db, { tenantId: who.tenantId, userId: who.userId });
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      moduleId: "M30",
      operation: "discussion.post",
      mergeRule: "append-only",
    });
  });

  it("maps locked-thread and invalid-parent errors without leaking post text", async () => {
    const thread = mockDb.discussionThreads.find((row) => row.id === DISCUSSION_THREAD.rvMathQna)!;
    thread.locked = true;
    const secret = "PRIVATE-DRAFT-TEXT-999";

    const lockedView = renderForm();
    fireEvent.change(await screen.findByLabelText(/^Reply to thread/), {
      target: { value: secret },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    const lockedAlert = await screen.findByRole("alert");
    expect(lockedAlert).toHaveTextContent("This thread is locked and cannot accept new replies.");
    expect(lockedAlert.textContent).not.toContain(secret);
    lockedView.unmount();

    thread.locked = false;
    renderForm({ parentPostId: "dpo-missing-parent" });
    fireEvent.change(await screen.findByLabelText(/^Reply to post/), {
      target: { value: secret },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    const parentAlert = await screen.findByRole("alert");
    expect(parentAlert).toHaveTextContent("The post you replied to is no longer available.");
    expect(parentAlert.textContent).not.toContain(secret);
  });
});
