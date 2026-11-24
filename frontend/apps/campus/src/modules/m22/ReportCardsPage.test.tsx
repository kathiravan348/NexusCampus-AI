import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

it("filters term cards by class group and learner", async () => {
  const cards = mockDb.reportCards.filter((row) => row.tenantId === TENANT.riverside);
  const groups = mockDb.classGroups.filter((row) => row.tenantId === TENANT.riverside);
  const group = groups.find((g) =>
    mockDb.enrolments.some(
      (e) =>
        e.classGroupId === g.id &&
        cards.some((c) => c.learnerId === e.learnerId && c.academicYearId === g.academicYearId),
    ),
  )!;
  const members = mockDb.enrolments.filter((e) => e.classGroupId === group.id);
  const expected = cards.filter(
    (c) =>
      c.academicYearId === group.academicYearId && members.some((e) => e.learnerId === c.learnerId),
  );
  renderApp("/report-cards", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
  const select = await screen.findByLabelText("Class group");
  await within(select).findByRole("option", { name: group.name });
  fireEvent.change(select, { target: { value: group.id } });
  const list = () => within(screen.getByRole("list", { name: "Report cards" }));
  await waitFor(() => expect(list().getAllByRole("button")).toHaveLength(expected.length));
  const id = expected[0]!.learnerId;
  fireEvent.change(screen.getByLabelText("Learner"), { target: { value: id } });
  expect(list().getAllByRole("button")).toHaveLength(
    expected.filter((c) => c.learnerId === id).length,
  );
});

it("withholds unpublished details even when a family opens a direct link", async () => {
  const card = mockDb.reportCards.find((c) => c.tenantId === TENANT.riverside)!;
  Object.assign(card, { status: "draft", publishedAt: null });
  renderApp(`/report-cards?card=${card.id}`, {
    as: persona(TENANT.riverside, "guardian"),
    modules: MODULES,
  });
  expect(await screen.findByText("Report card unavailable")).toBeVisible();
  expect(screen.queryByText("Grade", { selector: "dt" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Back to report cards" }));
  expect(screen.queryByLabelText("Class group")).toBeNull();
});
