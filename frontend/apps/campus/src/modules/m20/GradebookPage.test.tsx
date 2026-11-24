import { TENANT, mockDb } from "@nexus/mocks";
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("GradebookPage", () => {
  it("opens the selected class assessment from the gradebook route", async () => {
    const assessment = mockDb.assessments.find(
      (row) => row.tenantId === TENANT.riverside && row.status === "marking",
    )!;
    const offering = mockDb.subjectOfferings.find(
      (row) => row.id === assessment.subjectOfferingId,
    )!;
    renderApp("/gradebook", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "Gradebook" })).toBeVisible();
    const groupSelect = await screen.findByLabelText("Class group");
    fireEvent.change(groupSelect, { target: { value: offering.classGroupId } });
    const heading = await screen.findByRole("heading", { name: "Assessments" });
    const list = within(heading.parentElement!);
    fireEvent.click((await list.findAllByRole("button", { name: /Marking/ }))[0]!);
    expect(await screen.findByRole("heading", { name: "Mark sheet" })).toBeVisible();
    expect(screen.getByTestId("last-synced")).toBeVisible();
  });

  it("hides the gradebook tile on home for a guardian", async () => {
    renderApp("/", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: /Welcome/ })).toBeVisible();
    expect(screen.queryByRole("link", { name: /Gradebook/ })).not.toBeInTheDocument();
  });

  it("denies the gradebook route to a guardian", async () => {
    renderApp("/gradebook", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Gradebook" })).not.toBeInTheDocument();
  });
});
