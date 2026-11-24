import { MESSAGE_THREAD, PERSON, TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("MessagesPage", () => {
  it("shows tabs, last sync time, and opens and closes a thread for a teacher", async () => {
    renderApp("/messages", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });

    expect(
      await screen.findByRole("heading", { level: 1, name: "Messages & notices" }),
    ).toBeVisible();
    expect(screen.getByRole("tab", { name: "Messages" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Notices" })).toBeVisible();
    expect(screen.getByRole("tab", { name: "Meetings" })).toBeVisible();
    expect(await screen.findByTestId("last-synced")).toBeVisible();
    expect(screen.getByRole("note")).toBeVisible();

    fireEvent.click(await screen.findByRole("button", { name: /Weekly class updates/ }));
    expect(await screen.findByRole("button", { name: "Back to messages" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Back to messages" }));
    expect(await screen.findByRole("list", { name: "Message threads" })).toBeVisible();
  });

  it("hides the Meetings tab for roles without meeting read permission", async () => {
    renderApp("/messages", { as: persona(TENANT.riverside, "learner"), modules: MODULES });

    expect(await screen.findByRole("tab", { name: "Messages" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Notices" })).toBeVisible();
    expect(screen.queryByRole("tab", { name: "Meetings" })).toBeNull();
  });

  it("opens the first permitted tab when messages permission is absent", async () => {
    const teacher = persona(TENANT.riverside, "teacher");
    const role = mockDb.roles.find((row) => row.id === teacher.roleId)!;
    role.permissions = role.permissions.filter(
      (code) =>
        code !== "m24.messages.read" &&
        code !== "m24.messages.send" &&
        code !== "m24.meetings.read",
    );

    renderApp("/messages", { as: teacher, modules: MODULES });

    expect(await screen.findByRole("tab", { name: "Notices" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByRole("tab", { name: "Messages" })).toBeNull();
    expect(screen.queryByRole("tab", { name: "Meetings" })).toBeNull();
  });

  it("shows the no-access screen when the viewer has no M24 read permissions", async () => {
    const teacher = persona(TENANT.riverside, "teacher");
    const role = mockDb.roles.find((row) => row.id === teacher.roleId)!;
    role.permissions = role.permissions.filter((code) => !code.startsWith("m24."));

    renderApp("/messages", { as: teacher, modules: MODULES });

    expect(await screen.findByText("No access")).toBeVisible();
  });

  it("reports unavailable threads for guardians and returns 404 from the API", async () => {
    const guardian = persona(TENANT.riverside, "guardian");
    const template = mockDb.messageThreads.find((row) => row.id === MESSAGE_THREAD.rv[1])!;
    mockDb.messageThreads.push({
      ...template,
      id: "thr-rv-staff-only",
      kind: "staff_group",
      subject: "Staff coordination",
      participantPersonIds: [PERSON.rvHelen, PERSON.rvTom],
      classGroupId: null,
    });

    renderApp("/messages?thread=thr-rv-staff-only", { as: guardian, modules: MODULES });
    expect(await screen.findByText("Thread unavailable")).toBeVisible();

    const headers = {
      "X-Nexus-Tenant": guardian.tenantId,
      "X-Nexus-User": guardian.userId,
      "Content-Type": "application/json",
    };
    const otherUrl = "http://localhost/api/v1/message-threads/thr-rv-staff-only/messages";
    const readOther = await fetch(otherUrl, { headers });
    expect(readOther.status).toBe(404);
    const postOther = await fetch(otherUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({ body: "Test reply" }),
    });
    expect(postOther.status).toBe(404);
  });
});
