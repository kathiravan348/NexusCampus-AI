import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("opens the linked exam and lists its subject, local times, rooms and maximum marks", async () => {
  const exam = mockDb.exams.find((row) => row.tenantId === TENANT.riverside)!;
  const paper = mockDb.examPapers.find((row) => row.examId === exam.id)!;
  const offering = mockDb.subjectOfferings.find((row) => row.id === paper.subjectOfferingId)!;
  const subject = mockDb.subjects.find((row) => row.id === offering.subjectId)!;
  const room = mockDb.rooms.find((row) => row.tenantId === TENANT.riverside)!;
  const otherExam = { ...exam, id: crypto.randomUUID(), name: "Second sitting" };
  mockDb.exams.unshift(otherExam);
  paper.roomIds = [room.id];
  renderApp(`/exams?exam=${exam.id}`, { as: persona(TENANT.riverside, "admin"), modules: MODULES });

  const select = await screen.findByLabelText("Exam");
  expect(select).toHaveValue(exam.id);
  expect((await screen.findAllByRole("heading", { name: subject.name })).length).toBeGreaterThan(0);
  expect((await screen.findAllByText(`Rooms: ${room.name}`)).length).toBeGreaterThan(0);
  expect((await screen.findAllByText(`Maximum marks: ${paper.maxMarks}`)).length).toBeGreaterThan(
    0,
  );
  expect(
    screen.getAllByText((text) => text.includes(`${paper.start}–${paper.end}`)).length,
  ).toBeGreaterThan(0);
  fireEvent.change(select, { target: { value: otherExam.id } });
  expect(await screen.findByText("No papers for this exam.")).toBeVisible();
});
