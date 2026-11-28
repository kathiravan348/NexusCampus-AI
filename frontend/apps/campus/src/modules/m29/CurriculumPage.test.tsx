import { OFFERING, TENANT, mockDb, roleId } from "@nexus/mocks";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openCurriculum(role: "admin" | "teacher" | "guardian" | "learner" = "teacher") {
  return renderApp("/teaching/curriculum", {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

function selectTab(name: string) {
  const tab = screen.getByRole("tab", { name });
  fireEvent.mouseDown(tab);
  fireEvent.click(tab);
}

describe("CurriculumPage (M29)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("lets a Riverside teacher browse outcomes, syllabus and draft a lesson plan", async () => {
    openCurriculum("teacher");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Curriculum" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.getByRole("tab", { name: "Outcomes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Syllabus & coverage" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Lesson plans" })).toBeInTheDocument();
    expect(await screen.findByText("Riverside Standards")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Ask Assist" }));
    const assist = await screen.findByRole("dialog", { name: "Nexus Assist" });
    fireEvent.click(within(assist).getByRole("button", { name: "Close" }));

    selectTab("Syllabus & coverage");
    const offeringSelect = (await screen.findByLabelText("Subject offering")) as HTMLSelectElement;
    fireEvent.change(offeringSelect, { target: { value: OFFERING.rvSouthYearFive[1] } });
    expect(await screen.findByText("Fractions")).toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuetext", "50.0% (1 of 2)");

    selectTab("Lesson plans");
    expect(await screen.findByText("Evidence Paragraphs")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "New lesson plan" }));
    const dialog = await screen.findByRole("dialog", { name: "New lesson plan" });
    const topicCheckbox = await within(dialog).findByRole("checkbox", {
      name: /Drafting a focused thesis statement/,
    });
    fireEvent.change(within(dialog).getByLabelText(/^Title/), {
      target: { value: "Thesis Practice Session" },
    });
    fireEvent.click(topicCheckbox);
    fireEvent.click(within(dialog).getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Thesis Practice Session")).toBeInTheDocument();
  });

  it.each(["learner", "guardian"] as const)(
    "shows Outcomes and Syllabus only when a %s has curriculum read without lesson-plan access",
    async (role) => {
      const targetRole = mockDb.roles.find((r) => r.id === roleId(TENANT.riverside, role))!;
      targetRole.permissions = [...targetRole.permissions, "m29.curriculum.read"];
      openCurriculum(role);

      expect(
        await screen.findByRole("heading", { level: 1, name: "Curriculum" }),
      ).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Outcomes" })).toBeInTheDocument();
      expect(screen.getByRole("tab", { name: "Syllabus & coverage" })).toBeInTheDocument();
      expect(screen.queryByRole("tab", { name: "Lesson plans" })).not.toBeInTheDocument();
    },
  );

  it("hides the Curriculum nav entry and blocks access without m29.curriculum.read", async () => {
    openCurriculum("learner");

    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Curriculum" })).not.toBeInTheDocument();
  });

  it("hides Ask Assist offline while keeping cached lists and L2 authoring usable", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    openCurriculum("teacher");

    expect(await screen.findByText("Riverside Standards")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Ask Assist" })).toBeInTheDocument();

    selectTab("Lesson plans");
    expect(await screen.findByText("Evidence Paragraphs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New lesson plan" })).toBeEnabled();

    onlineSpy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText("Evidence Paragraphs")).toBeInTheDocument();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.queryByRole("button", { name: "Ask Assist" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New lesson plan" })).toBeEnabled();
  });

  it("renders cleanly in pseudo-locale (en-XA)", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openCurriculum("teacher");

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByText("Riverside Standards")).toBeInTheDocument();
  });
});
