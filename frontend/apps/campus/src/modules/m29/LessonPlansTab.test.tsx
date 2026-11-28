import { OFFERING, TENANT } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { persona, renderApp } from "../../test/renderApp";

async function openLessonPlansTab(role: "admin" | "teacher" = "teacher") {
  renderApp("/teaching/curriculum", { as: persona(TENANT.riverside, role), modules: MODULES });
  const tab = await screen.findByRole("tab", { name: "Lesson plans" });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("LessonPlansTab (M29)", () => {
  it("lists plans with status chips, returned note and own Edit buttons", async () => {
    await openLessonPlansTab("teacher");

    expect(await screen.findByText("Evidence Paragraphs")).toBeInTheDocument();
    expect(screen.getByText("Returned")).toBeInTheDocument();
    expect(screen.getByText("Reviewer note")).toBeInTheDocument();
    expect(screen.getByText("Add a brief formative check.")).toBeInTheDocument();
    expect(screen.getByText("Gradients")).toBeInTheDocument();
    expect(screen.getByText("AI draft")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Edit Evidence Paragraphs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit Gradients" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Main Ideas" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Edit Equivalent Fractions" }),
    ).not.toBeInTheDocument();
  });

  it("filters by subject offering and edits a returned draft plan", async () => {
    await openLessonPlansTab("teacher");

    expect(await screen.findByText("Evidence Paragraphs")).toBeInTheDocument();
    const select = screen.getByLabelText("Subject offering") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: OFFERING.rvNorthYearNine[0] } });

    expect(await screen.findByText("Evidence Paragraphs")).toBeInTheDocument();
    expect(screen.queryByText("Equivalent Fractions")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Evidence Paragraphs" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit lesson plan" });
    fireEvent.change(within(dialog).getByLabelText(/^Title/), {
      target: { value: "Evidence Paragraphs Revised" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Evidence Paragraphs Revised")).toBeInTheDocument();
  });

  it("shows empty and error states with retry", async () => {
    server.use(
      http.get("*/api/v1/lesson-plans", () =>
        HttpResponse.json({ error: { code: "internal", message: "boom" } }, { status: 500 }),
      ),
    );
    await openLessonPlansTab("teacher");

    expect(
      await screen.findByRole("heading", { name: "Lesson plans could not be loaded." }),
    ).toBeInTheDocument();

    server.resetHandlers();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Evidence Paragraphs")).toBeInTheDocument();

    const select = screen.getByLabelText("Subject offering") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: OFFERING.rvSouthYearSeven[0] } });
    expect(await screen.findByRole("heading", { name: "No lesson plans yet" })).toBeInTheDocument();
  });
});

it("opens a submitted plan for administrative review and refreshes its card", async () => {
  await openLessonPlansTab("admin");
  const submitted = await screen.findByText("Submitted");
  const card = within(submitted.closest("li")!);
  fireEvent.click(card.getByRole("button", { name: "Return" }));
  const dialog = await screen.findByRole("dialog", { name: "Review lesson plan" });
  fireEvent.change(within(dialog).getByLabelText(/^Reviewer note/), {
    target: { value: "Add a warm-up." },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "Return" }));
  expect(await card.findByText("Add a warm-up.")).toBeInTheDocument();
  expect(card.getByText("Returned")).toBeInTheDocument();
});

it("confirms offline submission and keeps the last synced status visible", async () => {
  await openLessonPlansTab();
  const title = await screen.findByText("Evidence Paragraphs");
  const card = within(title.closest("li")!);
  const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  try {
    fireEvent.click(card.getByRole("button", { name: "Submit" }));
    expect(
      await screen.findByText("Lesson plan saved offline. Waiting to sync."),
    ).toBeInTheDocument();
    expect(card.getByText("Returned")).toBeInTheDocument();
  } finally {
    online.mockRestore();
  }
});
