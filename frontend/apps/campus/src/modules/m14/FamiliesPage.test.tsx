import { HOUSEHOLD, TENANT, USER, mockDb } from "@nexus/mocks";
import { act, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openFamilies(role: "admin" | "teacher" | "guardian" = "admin") {
  return renderApp("/families", {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

describe("FamiliesPage (M14)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("shows households, returned address, members, court notes and pickups to an admin", async () => {
    const household = mockDb.households.find((row) => row.id === HOUSEHOLD.rvBennett);
    if (!household) throw new Error("Missing household fixture");
    household.address = {
      line1: "14 River Lane",
      city: "Bristol",
      postalCode: "BS1 4AA",
      countryCode: "GB",
    };

    openFamilies("admin");

    expect(await screen.findByRole("heading", { level: 1, name: "Families" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);

    const list = await screen.findByRole("list", { name: "Households" });
    expect(
      within(list).getByRole("heading", { level: 2, name: "Bennett household" }),
    ).toBeVisible();
    expect(within(list).getByRole("heading", { level: 2, name: "Shah household" })).toBeVisible();
    expect(within(list).getByRole("heading", { level: 2, name: "Price household" })).toBeVisible();

    expect(screen.getByText("14 River Lane, Bristol, BS1 4AA, GB")).toBeInTheDocument();
    expect(await screen.findByText("Eleanor Bennett")).toBeInTheDocument();
    expect(screen.getByText("+44 770 090 0106")).toBeInTheDocument();
    expect(await screen.findByText("Court restricted")).toBeInTheDocument();
    expect(screen.getByText("Collection requires prior court approval.")).toBeInTheDocument();
  });

  it("masks court notes from a teacher while keeping the restriction badge", async () => {
    openFamilies("teacher");

    expect(await screen.findByText("Price household")).toBeInTheDocument();
    expect(await screen.findByText("Court restricted")).toBeInTheDocument();
    expect(screen.queryByText("Collection requires prior court approval.")).not.toBeInTheDocument();
    expect(screen.queryByText("Court order note")).not.toBeInTheDocument();
  });

  it("scopes a guardian to their own household and authorised pickups", async () => {
    openFamilies("guardian");

    expect(
      await screen.findByRole("heading", { level: 2, name: "Bennett household" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Eleanor Bennett")).toBeInTheDocument();
    expect(screen.queryByText("Shah household")).not.toBeInTheDocument();
    expect(screen.queryByText("Price household")).not.toBeInTheDocument();
  });

  it("shows the no-access message on 403", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    openFamilies("admin");

    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("shows an empty state when no households exist", async () => {
    mockDb.households = [];
    openFamilies("admin");

    expect(await screen.findByRole("heading", { name: "No households yet" })).toBeInTheDocument();
  });

  it("keeps cached households with last synced while offline", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    openFamilies("admin");

    expect(await screen.findByText("Bennett household")).toBeInTheDocument();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);

    onlineSpy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText("Bennett household")).toBeInTheDocument();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
  });

  it("renders cleanly in pseudo-locale (en-XA)", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openFamilies("admin");

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByText("Bennett household")).toBeInTheDocument();
  });
});
