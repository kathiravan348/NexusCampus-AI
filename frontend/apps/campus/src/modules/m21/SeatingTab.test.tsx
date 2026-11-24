import { TENANT, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

afterEach(() => {
  vi.restoreAllMocks();
  act(() => {
    window.dispatchEvent(new Event("online"));
  });
});

it("confirms seat replacement, shows the room and disables generation offline", async () => {
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
  const tenantId = TENANT.riverside;
  const paper = mockDb.examPapers.find((row) => row.tenantId === tenantId)!;
  const exam = mockDb.exams.find((row) => row.id === paper.examId)!;
  exam.status = "planned";
  const room = mockDb.rooms.find((row) => row.tenantId === tenantId)!;
  room.capacity = null;
  paper.roomIds = [room.id];
  const offering = mockDb.subjectOfferings.find((row) => row.id === paper.subjectOfferingId)!;
  const placement = mockDb.enrolments.find((row) => row.tenantId === tenantId)!;
  mockDb.enrolments.push({
    ...placement,
    id: crypto.randomUUID(),
    classGroupId: offering.classGroupId,
    effectiveFrom: paper.date,
    effectiveTo: null,
  });
  renderApp(`/exams?exam=${exam.id}`, { as: persona(tenantId, "admin"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Seating" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  const generate = await screen.findByRole("button", { name: "Generate seating plan" });
  fireEvent.click(generate);
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText(/replaces the existing seat assignments/)).toBeVisible();
  fireEvent.click(within(dialog).getByRole("button", { name: "Generate seating plan" }));
  expect(await screen.findByText("Seating plan generated.")).toBeVisible();
  expect(await screen.findByText("A1")).toBeVisible();
  expect(await screen.findByText(room.name)).toBeVisible();

  const saved = mockDb.seatAssignments.filter((seat) => seat.examPaperId === paper.id);
  paper.roomIds = [];
  fireEvent.click(generate);
  const replacement = await screen.findByRole("dialog");
  fireEvent.click(within(replacement).getByRole("button", { name: "Generate seating plan" }));
  expect(await screen.findByText("The assigned rooms do not have enough seats.")).toBeVisible();
  expect(mockDb.seatAssignments.filter((seat) => seat.examPaperId === paper.id)).toEqual(saved);
  expect(screen.getByText("A1")).toBeVisible();

  online.mockReturnValue(false);
  act(() => {
    window.dispatchEvent(new Event("offline"));
  });
  expect(generate).toBeDisabled();
  expect(screen.getByText("Needs a connection")).toBeVisible();
  expect(screen.getByText("A1")).toBeVisible();
});
