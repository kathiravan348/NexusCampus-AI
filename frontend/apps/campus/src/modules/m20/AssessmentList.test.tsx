import { TENANT, mockDb } from "@nexus/mocks";
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

describe("AssessmentList", () => {
  it("lists class assessments with kind, max, weight, due date and status text", async () => {
    const assessment = mockDb.assessments.find(
      (row) => row.tenantId === TENANT.riverside && row.status === "published",
    )!;
    const offering = mockDb.subjectOfferings.find(
      (row) => row.id === assessment.subjectOfferingId,
    )!;
    renderApp(`/gradebook?group=${encodeURIComponent(offering.classGroupId)}`, {
      as: persona(TENANT.riverside, "teacher"),
      modules: MODULES,
    });
    const heading = await screen.findByRole("heading", { name: "Assessments" });
    const buttons = within(heading.parentElement!).getAllByRole("button");
    expect(buttons).toHaveLength(1);
    const button = buttons[0]!;
    expect(button).toHaveAccessibleName(/Mid-Term Evaluation/);
    expect(button).toHaveAccessibleName(/Test/);
    expect(button).toHaveAccessibleName(/Max 100/);
    expect(button).toHaveAccessibleName(/Weight 50%/);
    expect(button).toHaveAccessibleName(/Published/);
    expect(button.querySelector("time")?.dateTime).toBe(assessment.dueOn);
  });
});
