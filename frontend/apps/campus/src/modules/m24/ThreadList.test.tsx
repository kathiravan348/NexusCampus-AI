import { MESSAGE_THREAD, PERSON, TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("ThreadList", () => {
  it("orders threads newest first, shows all four kinds and archived badges", async () => {
    const base = mockDb.messageThreads.find((row) => row.id === MESSAGE_THREAD.rv[0])!;
    mockDb.messageThreads.push(
      {
        ...base,
        id: "thr-rv-direct-new",
        kind: "direct",
        subject: "Direct schedule update",
        participantPersonIds: [PERSON.rvTom, PERSON.rvHelen],
        classGroupId: null,
        lastMessageAt: "2026-11-20T09:00:00Z",
        archived: false,
        updatedAt: "2026-11-20T09:00:00Z",
      },
      {
        ...base,
        id: "thr-rv-staff-archived",
        kind: "staff_group",
        subject: "Staff briefing",
        participantPersonIds: [PERSON.rvTom, PERSON.rvHelen],
        classGroupId: null,
        lastMessageAt: "2026-11-17T08:00:00Z",
        archived: true,
        updatedAt: "2026-11-17T08:00:00Z",
      },
      {
        ...base,
        id: "thr-rv-broadcast-empty",
        kind: "broadcast",
        subject: "Campus broadcast",
        participantPersonIds: [PERSON.rvTom],
        classGroupId: null,
        lastMessageAt: null,
        archived: false,
        createdAt: "2026-11-15T08:00:00Z",
        updatedAt: "2026-11-15T08:00:00Z",
      },
    );

    renderApp("/messages", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });

    const list = within(await screen.findByRole("list", { name: "Message threads" }));
    const buttons = list.getAllByRole("button");
    expect(buttons).toHaveLength(4);

    expect(buttons[0]).toHaveTextContent("Direct schedule update");
    expect(within(buttons[0]!).getByText("Direct message")).toBeVisible();
    expect(within(buttons[0]!).queryByText("Archived")).toBeNull();

    expect(buttons[1]).toHaveTextContent("Weekly class updates");
    expect(within(buttons[1]!).getByText("Class group")).toBeVisible();

    expect(buttons[2]).toHaveTextContent("Staff briefing");
    expect(within(buttons[2]!).getByText("Staff group")).toBeVisible();
    expect(within(buttons[2]!).getByText("Archived")).toBeVisible();

    expect(buttons[3]).toHaveTextContent("Campus broadcast");
    expect(within(buttons[3]!).getByText("Broadcast")).toBeVisible();
    expect(within(buttons[3]!).getByText("No messages yet")).toBeVisible();

    fireEvent.click(buttons[1]!);
    expect(await screen.findByRole("button", { name: "Back to messages" })).toBeVisible();
  });

  it("shows an empty state when the viewer has no threads", async () => {
    mockDb.messageThreads = mockDb.messageThreads.filter(
      (row) => row.tenantId !== TENANT.riverside,
    );

    renderApp("/messages", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });

    expect(await screen.findByText("No message threads yet")).toBeVisible();
  });
});
