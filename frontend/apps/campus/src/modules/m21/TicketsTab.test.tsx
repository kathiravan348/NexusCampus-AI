import { FEE_INVOICE, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("shows family tickets and request status without private text or staff lookups", async () => {
  const tenantId = TENANT.riverside;
  const own = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.rv[0])!;
  const other = mockDb.feeInvoices.find((row) => row.id === FEE_INVOICE.rv[2])!;
  const ticket = mockDb.hallTickets.find((row) => row.tenantId === tenantId)!;
  const request = mockDb.revaluationRequests.find((row) => row.tenantId === tenantId)!;
  ticket.learnerId = own.learnerId;
  ticket.revoked = true;
  request.learnerId = own.learnerId;
  request.status = "changed";
  request.newMarks = request.oldMarks + 1;
  request.reason = "Private request text";
  mockDb.hallTickets.push({
    ...ticket,
    id: crypto.randomUUID(),
    learnerId: other.learnerId,
    ticketNumber: "OTHER-TICKET",
  });
  const staffLookup = vi.fn(() => HttpResponse.error());
  server.use(
    ...["exams", "exams/:id/papers", "subjects", "subject-offerings"].map((url) =>
      http.get(`*/api/v1/${url}`, staffLookup),
    ),
  );
  renderApp("/exams", { as: persona(tenantId, "guardian"), modules: MODULES });

  expect(await screen.findByText(`Ticket number: ${ticket.ticketNumber}`)).toBeVisible();
  expect(await screen.findByText("Revoked")).toBeVisible();
  const revised = await screen.findAllByText(`Revised marks: ${request.newMarks}`);
  const row = within(revised[0]!.closest("li")!);
  expect(row.getByText("Marks changed")).toBeVisible();
  expect(row.getByRole("heading", { name: "Paper" })).toBeVisible();
  expect(row.getByText(`Original marks: ${request.oldMarks}`)).toBeVisible();
  expect(screen.queryByText(/OTHER-TICKET/)).toBeNull();
  expect(screen.queryByText(request.reason)).toBeNull();
  expect(staffLookup).not.toHaveBeenCalled();
});

it("resolves ticket and paper names for staff", async () => {
  const tenantId = TENANT.riverside;
  const ticket = mockDb.hallTickets.find((row) => row.tenantId === tenantId)!;
  const exam = mockDb.exams.find((row) => row.id === ticket.examId)!;
  const request = mockDb.revaluationRequests.find((row) => row.tenantId === tenantId)!;
  const paper = mockDb.examPapers.find((row) => row.id === request.examPaperId)!;
  const offering = mockDb.subjectOfferings.find((row) => row.id === paper.subjectOfferingId)!;
  const subject = mockDb.subjects.find((row) => row.id === offering.subjectId)!;
  renderApp("/exams", { as: persona(tenantId, "admin"), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Hall tickets & re-evaluation" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
  const number = await screen.findByText(`Ticket number: ${ticket.ticketNumber}`);
  expect(
    await within(number.closest("li")!).findByRole("heading", { name: exam.name }),
  ).toBeVisible();
  expect((await screen.findAllByRole("heading", { name: subject.name }))[0]).toBeVisible();
});
