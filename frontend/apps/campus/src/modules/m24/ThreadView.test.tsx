import { MESSAGE_THREAD, TENANT, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

const threadId = MESSAGE_THREAD.rv[0];

describe("ThreadView", () => {
  it("orders messages oldest first, shows sender labels and sends a reply", async () => {
    const teacher = persona(TENANT.riverside, "teacher");
    const first = mockDb.threadMessages.find((row) => row.threadId === threadId)!;
    first.editedAt = "2026-11-17T09:10:00Z";
    mockDb.threadMessages.push({
      ...first,
      id: "msg-rv-earliest-unknown",
      senderPersonId: "per-unknown",
      body: "Earlier welcome note.",
      sentAt: "2026-11-16T08:00:00Z",
      editedAt: null,
    });

    const otherMsg = mockDb.threadMessages.find(
      (msg) =>
        msg.threadId === threadId && msg.id !== first.id && msg.id !== "msg-rv-earliest-unknown",
    )!;
    const otherPerson = mockDb.people.find(
      (row) => row.tenantId === TENANT.riverside && row.id === otherMsg.senderPersonId,
    )!;
    const otherName = otherPerson.preferredName || otherPerson.legalName;

    renderApp(`/messages?thread=${encodeURIComponent(threadId)}`, {
      as: teacher,
      modules: MODULES,
    });

    const list = within(await screen.findByRole("list", { name: "Thread messages" }));
    const items = list.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByText("Member")).toBeVisible();
    expect(within(items[0]!).getByText("Earlier welcome note.")).toBeVisible();
    expect(within(items[1]!).getByText("You")).toBeVisible();
    expect(within(items[1]!).getByText("Edited")).toBeVisible();
    expect(within(items[2]!).getByText(otherName)).toBeVisible();

    const textbox = screen.getByLabelText(/Reply/);
    fireEvent.change(textbox, { target: { value: "See you on Thursday" } });
    expect(screen.getByText("19 / 4,000")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));

    await waitFor(() => expect(list.getAllByRole("listitem")).toHaveLength(4));
    expect(screen.getByText("See you on Thursday")).toBeVisible();
    expect(textbox).toHaveValue("");
  });

  it("validates blank and over-length replies inline", async () => {
    renderApp(`/messages?thread=${encodeURIComponent(threadId)}`, {
      as: persona(TENANT.riverside, "teacher"),
      modules: MODULES,
    });

    const textbox = await screen.findByLabelText(/Reply/);
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("This field is required")).toBeVisible();

    fireEvent.change(textbox, { target: { value: "a".repeat(4001) } });
    fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
    expect(await screen.findByText("Message must be 4,000 characters or fewer.")).toBeVisible();
  });

  it("hides the reply box on archived threads and refuses POST with 409", async () => {
    const teacher = persona(TENANT.riverside, "teacher");
    mockDb.messageThreads.find((row) => row.id === threadId)!.archived = true;

    renderApp(`/messages?thread=${encodeURIComponent(threadId)}`, {
      as: teacher,
      modules: MODULES,
    });

    expect(await screen.findByRole("list", { name: "Thread messages" })).toBeVisible();
    expect(screen.getByText("Archived")).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: "Send reply" })).toBeNull();

    const response = await fetch(`http://localhost/api/v1/message-threads/${threadId}/messages`, {
      method: "POST",
      headers: {
        "X-Nexus-Tenant": teacher.tenantId,
        "X-Nexus-User": teacher.userId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ body: "Blocked reply" }),
    });
    expect(response.status).toBe(409);
  });

  it("hides the reply box when the viewer lacks send permission", async () => {
    const teacher = persona(TENANT.riverside, "teacher");
    const role = mockDb.roles.find((row) => row.id === teacher.roleId)!;
    role.permissions = role.permissions.filter((code) => code !== "m24.messages.send");

    renderApp(`/messages?thread=${encodeURIComponent(threadId)}`, {
      as: teacher,
      modules: MODULES,
    });

    expect(await screen.findByRole("list", { name: "Thread messages" })).toBeVisible();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows Waiting to send for an offline reply and replays it once when online", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      renderApp(`/messages?thread=${encodeURIComponent(threadId)}`, {
        as: persona(TENANT.riverside, "teacher"),
        modules: MODULES,
      });

      const textbox = await screen.findByLabelText(/Reply/);
      const initialCount = mockDb.threadMessages.length;

      online.mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });

      fireEvent.change(textbox, { target: { value: "Offline queued note" } });
      fireEvent.click(screen.getByRole("button", { name: "Send reply" }));

      expect(await screen.findByText("Waiting to send")).toBeVisible();
      expect(screen.getByText("Offline queued note")).toBeVisible();
      expect(mockDb.threadMessages).toHaveLength(initialCount);

      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      await waitFor(() => expect(mockDb.threadMessages).toHaveLength(initialCount + 1));
      await waitFor(() => expect(screen.queryByText("Waiting to send")).toBeNull());
      expect(screen.getByText("Offline queued note")).toBeVisible();
    } finally {
      online.mockRestore();
    }
  });

  it("shows Not sent when a queued offline reply fails on replay", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    try {
      renderApp(`/messages?thread=${encodeURIComponent(threadId)}`, {
        as: persona(TENANT.riverside, "teacher"),
        modules: MODULES,
      });

      const textbox = await screen.findByLabelText(/Reply/);

      online.mockReturnValue(false);
      act(() => {
        window.dispatchEvent(new Event("offline"));
      });

      fireEvent.change(textbox, { target: { value: "Queued before archive" } });
      fireEvent.click(screen.getByRole("button", { name: "Send reply" }));
      expect(await screen.findByText("Waiting to send")).toBeVisible();

      mockDb.messageThreads.find((row) => row.id === threadId)!.archived = true;
      online.mockReturnValue(true);
      act(() => {
        window.dispatchEvent(new Event("online"));
      });

      expect(await screen.findByText("Not sent")).toBeVisible();
      expect(screen.getByText("Queued before archive")).toBeVisible();
    } finally {
      online.mockRestore();
    }
  });
});
