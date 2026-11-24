import { LEARNER, TENANT, mockDb } from "@nexus/mocks";
import { screen, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("shows grades, zero and missing marks, and remarks to read-only staff", async () => {
  const card = mockDb.reportCards.find(
    (row) => row.tenantId === TENANT.riverside && row.status === "published",
  )!;
  const line = card.lines[0]!;
  card.lines = [
    { ...line, marksPercent: 0, remark: "First subject comment." },
    { ...line, marksPercent: null, remark: null },
  ];
  card.overallRemark = "End of term comment.";
  const teacher = persona(TENANT.riverside, "teacher");
  renderApp(`/report-cards?card=${card.id}`, {
    as: teacher,
    modules: MODULES,
  });
  const view = within(await screen.findByRole("article"));
  expect(view.getAllByText(line.grade, { selector: "dd" })).toHaveLength(2);
  expect(view.getByText("0%")).toBeVisible();
  expect(view.getByText("—")).toBeVisible();
  expect(view.getByText("First subject comment.")).toBeVisible();
  expect(view.getByText("End of term comment.")).toBeVisible();
  const response = await fetch(`http://localhost/api/v1/report-cards/${card.id}/status`, {
    method: "POST",
    headers: { "X-Nexus-Tenant": teacher.tenantId, "X-Nexus-User": teacher.userId },
    body: JSON.stringify({ status: "withdrawn" }),
  });
  expect(response.status).toBe(403);
  expect(view.queryByRole("button", { name: "Withdraw" })).toBeNull();
});

it("shows published remarks to the linked family", async () => {
  const card = mockDb.reportCards.find(
    (row) => row.tenantId === TENANT.littleSteps && row.status === "published",
  )!;
  card.learnerId = LEARNER.lsRohan;
  card.overallRemark = "Term summary.";
  renderApp(`/report-cards?card=${card.id}`, {
    as: persona(TENANT.littleSteps, "guardian"),
    modules: MODULES,
  });
  const view = within(await screen.findByRole("article"));
  expect(view.getByText("Term summary.")).toBeVisible();
  expect(view.queryByRole("button")).toBeNull();
});
