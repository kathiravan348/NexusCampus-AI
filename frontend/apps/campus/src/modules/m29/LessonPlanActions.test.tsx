import { LESSON_PLAN, TENANT, mockDb } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { LessonPlanActions } from "./LessonPlanActions";

async function setup() {
  signInAs(persona(TENANT.riverside, "teacher"));
  const plan = mockDb.lessonPlans.find((row) => row.id === LESSON_PLAN.rvReturned)!;
  const props = {
    plan,
    ownStaffProfileId: plan.staffProfileId,
    canWrite: true,
    canReview: false,
    pending: false,
    onEdit: vi.fn(),
    onSubmit: vi.fn(),
    onDeliver: vi.fn(),
    onReview: vi.fn(),
  };
  const db = freshDb();
  const createClient = () => createNexusQueryClient();
  const view = (changes: Partial<typeof props>) => (
    <AppProviders db={db} createClient={createClient}>
      <LessonPlanActions {...props} {...changes} />
    </AppProviders>
  );
  const { rerender } = render(view({}));
  await screen.findByRole("button", { name: "Submit" });
  return { props, change: (changes: Partial<typeof props>) => rerender(view(changes)) };
}

describe("LessonPlanActions", () => {
  it("offers submission only for editable plans and delivery only for approved plans", async () => {
    const { props, change } = await setup();
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));
    expect(props.onSubmit).toHaveBeenCalledOnce();
    change({ plan: { ...props.plan, status: "approved" } });
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/^Date taught/), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark delivered" }));
    expect(props.onDeliver).toHaveBeenCalledWith("2026-01-01");
    change({ plan: { ...props.plan, status: "delivered" } });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("requires a different staff reviewer and hides actions from read-only viewers", async () => {
    const { props, change } = await setup();
    const plan = { ...props.plan, status: "submitted" as const };
    change({ plan, canReview: true });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    change({ plan, canWrite: false, ownStaffProfileId: "reviewer", canReview: true });
    fireEvent.click(screen.getByRole("button", { name: "Return" }));
    expect(props.onReview).toHaveBeenCalledWith("return");
    change({ plan, canWrite: false, canReview: false });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
