import { PERSON, TENANT, USER, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

describe("StaffPortalPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it.each([
    [TENANT.riverside, USER.rvTom],
    [TENANT.northbridge, USER.nbElena],
  ] as const)("links staff cards and teaching tools", async (tenant, user) => {
    const teacher = persona(tenant, "teacher");
    expect(teacher.userId).toBe(user);
    renderApp("/staff", { as: teacher, modules: MODULES });

    const main = await screen.findByRole("main");
    const cards = await within(main).findByRole("list", { name: "Summary cards" });
    expect(within(main).getByRole("heading", { level: 1, name: "Staff portal" })).toBeVisible();
    expect(screen.getByRole("note")).toBeVisible();
    expect(within(main).queryByText("Totals for all your children")).toBeNull();

    for (const [title, href] of [
      [/Attendance/, "/attendance"],
      [/Pending leave requests/, "/attendance/leave"],
      [/Unread messages/, "/messages"],
      [/Notices/, "/notices"],
    ] as const) {
      const link = within(cards).getByRole("link", { name: title });
      expect(link).toHaveAttribute("href", href);
      expect(within(link).getByText(/^\d+$/)).toBeVisible();
    }

    const quickNav = within(main).getByRole("navigation", { name: "Quick links" });
    const menu = screen.getAllByRole("navigation")[0]!;
    for (const name of ["Attendance", "Timetable", "Gradebook", "Messages & notices"]) {
      const menuLink = within(menu).queryByRole("link", { name });
      const quickLink = within(quickNav).queryByRole("link", { name });
      if (menuLink) expect(quickLink).toHaveAttribute("href", menuLink.getAttribute("href"));
      else expect(quickLink).toBeNull();
    }

    fireEvent.click(within(cards).getByRole("link", { name: /Attendance/ }));
    expect(await screen.findByRole("heading", { level: 1, name: "Attendance" })).toBeVisible();
  });

  it("shows the teaching summary to an early-years teacher", async () => {
    const profile = mockDb.roleProfiles.find((row) => row.personId === PERSON.lsArjun)!;
    const teacher = persona(profile.tenantId, "teacher");
    expect(teacher.userId).toBe(USER.lsArjun);
    renderApp("/staff", { as: teacher, modules: MODULES });

    expect(await screen.findByRole("list", { name: "Summary cards" })).toBeVisible();
    expect(screen.getByRole("heading", { level: 1, name: "Staff portal" })).toBeVisible();
  });

  it("shows the no-access message for non-staff roles and forbidden responses", async () => {
    for (const role of ["guardian", "learner", "admin"] as const) {
      const view = renderApp("/staff", {
        as: persona(TENANT.northbridge, role),
        modules: MODULES,
      });
      expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
      expect(screen.queryByRole("heading", { level: 1, name: "Staff portal" })).toBeNull();
      view.unmount();
    }

    server.use(
      http.get("*/api/v1/me/home", () =>
        HttpResponse.json(
          { error: { code: "forbidden", message: "Access denied for this role." } },
          { status: 403 },
        ),
      ),
    );
    renderApp("/staff", { as: persona(TENANT.northbridge, "teacher"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
  });

  it("renders cached portal data with last synced while offline and hides Assist", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { router } = renderApp("/staff", {
      as: persona(TENANT.northbridge, "teacher"),
      modules: MODULES,
    });

    expect(await screen.findByRole("link", { name: /Pending leave requests/ })).toBeVisible();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    const briefing = await screen.findByRole("button", { name: "Daily briefing" });
    expect(briefing).toHaveAccessibleDescription("Try asking “What should I review today?”");
    fireEvent.click(briefing);
    const dialog = await screen.findByRole("dialog", { name: "Nexus Assist" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    server.use(http.get("*/api/v1/me/home", () => HttpResponse.error()));

    await act(async () => {
      await router.navigate("/");
    });
    await act(async () => {
      await router.navigate("/staff");
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Staff portal" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Pending leave requests/ })).toBeVisible();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.queryByRole("button", { name: "Daily briefing" })).toBeNull();
  });

  it("shows the failed message without crashing when offline with no cached home", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    renderApp("/", { as: persona(TENANT.northbridge, "teacher"), modules: MODULES });

    expect(await screen.findByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();
    const nav = screen.getAllByRole("navigation")[0]!;
    const portalLink = await within(nav).findByRole("link", { name: "Staff portal" });

    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    server.use(http.get("*/api/v1/me/home", () => HttpResponse.error()));

    fireEvent.click(portalLink);

    expect(await screen.findByText("Staff portal could not be loaded.")).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("renders cleanly in pseudo-locale", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.northbridge]: "en-XA" }));
    renderApp("/staff", { as: persona(TENANT.northbridge, "teacher"), modules: MODULES });

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByTestId("last-synced")).toBeVisible();
  });
});
