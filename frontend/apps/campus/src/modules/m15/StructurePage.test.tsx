import { CALENDAR, TENANT, YEAR_LEVEL, mockDb } from "@nexus/mocks";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openStructure(role: "admin" | "teacher" | "guardian" | "learner" = "admin") {
  return renderApp("/academics/structure", {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

describe("StructurePage (M15)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("shows programs, year levels, class groups and lets a Riverside admin add one", async () => {
    openStructure("admin");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Academic structure" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.getByRole("tab", { name: "Programs & classes" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Subjects" })).toBeInTheDocument();

    expect(await screen.findByText("Years 5 to 10")).toBeInTheDocument();
    expect(screen.getByText("Year 5")).toBeInTheDocument();
    expect(screen.getByText("Year 5 South Section")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Ask Assist" }));
    const assistDialog = await screen.findByRole("dialog", { name: "Nexus Assist" });
    fireEvent.click(within(assistDialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "Add class group" }));
    const dialog = await screen.findByRole("dialog", { name: "Add class group" });
    const yearSelect = within(dialog).getByLabelText(/Academic year/) as HTMLSelectElement;
    await waitFor(() => expect(yearSelect.value).toBe(CALENDAR.riversideSchool));
    const yearLevelSelect = within(dialog).getByLabelText("Year level") as HTMLSelectElement;
    await waitFor(() =>
      expect([...yearLevelSelect.options].map((o) => o.value)).toContain(YEAR_LEVEL.rvYearFive),
    );

    fireEvent.change(yearLevelSelect, { target: { value: YEAR_LEVEL.rvYearFive } });
    fireEvent.change(within(dialog).getByLabelText(/Code/), { target: { value: "Y5-B" } });
    fireEvent.change(within(dialog).getByLabelText(/Name/), {
      target: { value: "Year 5 South B" },
    });
    fireEvent.change(within(dialog).getByLabelText(/Capacity/), { target: { value: "30" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create class group" }));

    expect(await screen.findByText("Year 5 South B")).toBeInTheDocument();
    expect(screen.getByText("Y5-B")).toBeInTheDocument();
  });

  it.each(["teacher", "guardian", "learner"] as const)(
    "lets a Riverside %s read the screen without an Add class group button",
    async (role) => {
      openStructure(role);

      expect(
        await screen.findByRole("heading", { level: 1, name: "Academic structure" }),
      ).toBeInTheDocument();
      expect(await screen.findByText("Years 5 to 10")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add class group" })).not.toBeInTheDocument();
    },
  );

  it("hides Ask Assist when AI is switched off for the tenant", async () => {
    const settings = mockDb.aiSettings.find((row) => row.tenantId === TENANT.riverside)!;
    settings.enabled = false;
    openStructure("admin");

    expect(await screen.findByText("Years 5 to 10")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask Assist" })).not.toBeInTheDocument();
  });

  it("keeps cached lists with Last synced and disables adding while offline", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    openStructure("admin");

    expect(await screen.findByText("Years 5 to 10")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Ask Assist" })).toBeInTheDocument();
    const addButton = screen.getByRole("button", { name: "Add class group" });
    expect(addButton).toBeEnabled();

    onlineSpy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText("Years 5 to 10")).toBeInTheDocument();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(addButton).toBeDisabled();
    expect(screen.getByText("You are offline")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ask Assist" })).not.toBeInTheDocument();
  });

  it("renders cleanly in pseudo-locale (en-XA)", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openStructure("admin");

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByText("Years 5 to 10")).toBeInTheDocument();
  });
});
