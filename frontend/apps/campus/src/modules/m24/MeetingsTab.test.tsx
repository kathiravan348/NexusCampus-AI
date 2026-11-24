import { MEETING_SLOT, PERSON, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openMeetingsTab() {
  const tab = await screen.findByRole("tab", { name: "Meetings" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("MeetingsTab", () => {
  it("shows slot schedule, mode, location, learner name and status without notes", async () => {
    const existing = mockDb.meetingBookings.find((row) => row.tenantId === TENANT.riverside)!;
    const learner = mockDb.learners.find((row) => row.id === existing.learnerId)!;
    const person = mockDb.people.find((row) => row.id === learner.personId)!;
    const learnerName = person.preferredName || person.legalName;

    mockDb.meetingBookings.push({
      ...existing,
      id: "book-rv-video-attended",
      slotId: MEETING_SLOT.rv[1],
      status: "attended",
      note: "Confidential staff note",
    });

    renderApp("/messages", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    await openMeetingsTab();

    const list = within(await screen.findByRole("list", { name: "Meeting bookings" }));
    const items = list.getAllByRole("listitem");
    expect(items).toHaveLength(2);

    expect(within(items[0]!).getByText(learnerName)).toBeVisible();
    expect(within(items[0]!).getByText("14:00–14:20")).toBeVisible();
    expect(within(items[0]!).getByText("In person")).toBeVisible();
    expect(within(items[0]!).getByText("Conference Room A")).toBeVisible();
    expect(within(items[0]!).getByText("Booked")).toBeVisible();

    expect(within(items[1]!).getByText("14:30–14:50")).toBeVisible();
    expect(within(items[1]!).getByText("Video call")).toBeVisible();
    expect(within(items[1]!).getByText("Attended")).toBeVisible();

    expect(screen.queryByText(existing.note!)).toBeNull();
    expect(screen.queryByText("Confidential staff note")).toBeNull();
  });

  it("shows only own bookings to guardians and never renders the booking note", async () => {
    const existing = mockDb.meetingBookings.find((row) => row.tenantId === TENANT.riverside)!;
    mockDb.meetingBookings.push({
      ...existing,
      id: "book-rv-other-guardian",
      slotId: MEETING_SLOT.rv[1],
      guardianPersonId: PERSON.rvDaniel,
      status: "no_show",
      note: "Other family note",
    });

    renderApp("/messages", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    await openMeetingsTab();

    const list = within(await screen.findByRole("list", { name: "Meeting bookings" }));
    expect(list.getAllByRole("listitem")).toHaveLength(1);
    expect(list.getByText("Booked")).toBeVisible();
    expect(list.queryByText("No-show")).toBeNull();
    expect(screen.queryByText(existing.note!)).toBeNull();
    expect(screen.queryByText("Other family note")).toBeNull();
  });

  it("falls back to learner number when person directory details are unavailable", async () => {
    server.use(
      http.get("*/api/v1/people", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
      ),
    );
    const existing = mockDb.meetingBookings.find((row) => row.tenantId === TENANT.riverside)!;
    const learner = mockDb.learners.find((row) => row.id === existing.learnerId)!;

    renderApp("/messages", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    await openMeetingsTab();

    const list = within(await screen.findByRole("list", { name: "Meeting bookings" }));
    expect(await list.findByText(learner.learnerNumber)).toBeVisible();
  });

  it("shows an empty state when there are no bookings", async () => {
    mockDb.meetingBookings = mockDb.meetingBookings.filter(
      (row) => row.tenantId !== TENANT.riverside,
    );

    renderApp("/messages", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    await openMeetingsTab();

    expect(await screen.findByText("No meeting bookings to show")).toBeVisible();
  });
});
