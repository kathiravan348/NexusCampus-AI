import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { LessonPlanReviewDialog } from "./LessonPlanReviewDialog";

async function setup(decision: "approve" | "return") {
  signInAs(persona(TENANT.riverside, "admin"));
  const onSave = vi.fn().mockResolvedValue(true);
  const onClose = vi.fn();
  render(
    <AppProviders db={freshDb()} createClient={() => createNexusQueryClient()}>
      <LessonPlanReviewDialog
        title="Workshop"
        decision={decision}
        onSave={onSave}
        onClose={onClose}
      />
    </AppProviders>,
  );
  await screen.findByRole("dialog", { name: "Review lesson plan" });
  return { onSave, onClose };
}

describe("LessonPlanReviewDialog", () => {
  it("requires a note to return a plan and trims the saved note", async () => {
    const { onSave, onClose } = await setup("return");
    const button = screen.getByRole("button", { name: "Return" });
    fireEvent.click(button);
    expect(
      await screen.findByText("Enter a review note of 1 to 1,000 characters."),
    ).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/^Reviewer note/), {
      target: { value: "  Add a warm-up.  " },
    });
    fireEvent.click(button);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(onSave).toHaveBeenCalledWith({ decision: "return", note: "Add a warm-up." });
  });
  it("allows changing the decision to approval without a note", async () => {
    const { onSave } = await setup("return");
    fireEvent.change(screen.getByLabelText("Decision"), { target: { value: "approve" } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ decision: "approve", note: null }));
  });
});
