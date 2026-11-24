import { LEARNER, PERSON, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

describe("FamilyPortalPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("shows switcher, URL state, summary cards, and Assist for a guardian", async () => {
    const first = mockDb.people.find((row) => row.id === PERSON.rvOliver)!;
    const second = mockDb.people.find((row) => row.id === PERSON.rvMia)!;

    const { router } = renderApp(`/family?child=${LEARNER.rvMia}`, {
      as: persona(TENANT.riverside, "guardian"),
      modules: MODULES,
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Family" })).toBeVisible();
    expect(screen.getByRole("note")).toBeVisible();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);

    const select = await screen.findByLabelText("Child");
    await within(select).findByRole("option", { name: first.legalName });
    expect(within(select).getByRole("option", { name: second.legalName })).toBeInTheDocument();
    expect(select).toHaveValue(LEARNER.rvMia);

    fireEvent.change(select, { target: { value: LEARNER.rvOliver } });
    expect(select).toHaveValue(LEARNER.rvOliver);
    expect(router.state.location.search).toBe(`?child=${LEARNER.rvOliver}`);

    expect(screen.getAllByText("Totals for all your children")).toHaveLength(1);
    const cards = screen.getByRole("list", { name: "Summary cards" });
    expect(within(cards).getByRole("link", { name: /Attendance/ })).toHaveAttribute(
      "href",
      "/attendance",
    );
    expect(within(cards).getByRole("link", { name: /Unread messages/ })).toHaveAttribute(
      "href",
      "/messages",
    );
    expect(within(cards).getByRole("link", { name: /Notices/ })).toHaveAttribute(
      "href",
      "/notices",
    );
    const feesCard = within(cards).getByRole("link", { name: /Unpaid invoices/ });
    expect(feesCard).toHaveAttribute("href", "/fees");
    expect(within(feesCard).getByText(/^\d+$/)).toBeVisible();

    fireEvent.click(await screen.findByRole("button", { name: "Ask Assist" }));
    const dialog = await screen.findByRole("dialog", { name: "Nexus Assist" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    fireEvent.click(feesCard);
    expect(await screen.findByRole("heading", { level: 1, name: "Fees" })).toBeVisible();
  });

  it("shows only the child name without a select for a single-child guardian", async () => {
    const child = mockDb.people.find((row) => row.id === PERSON.hmChloe)!;

    renderApp("/family", { as: persona(TENANT.harmony, "guardian"), modules: MODULES });

    expect(await screen.findByRole("heading", { level: 1, name: "Family" })).toBeVisible();
    expect(await screen.findByText(child.legalName)).toBeVisible();
    expect(screen.queryByLabelText("Child")).toBeNull();
    expect(within(screen.getByRole("main")).queryByRole("combobox")).toBeNull();
    expect(screen.queryByText("Totals for all your children")).toBeNull();
  });

  it("shows the no-access message for non-family roles and forbidden responses", async () => {
    for (const role of ["teacher", "admin", "learner"] as const) {
      const view = renderApp("/family", { as: persona(TENANT.riverside, role), modules: MODULES });
      expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
      expect(screen.queryByRole("heading", { level: 1, name: "Family" })).toBeNull();
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
    renderApp("/family", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
  });

  it("renders cached home data with last synced while offline and hides Assist", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { router } = renderApp("/family", {
      as: persona(TENANT.riverside, "guardian"),
      modules: MODULES,
    });

    expect(await screen.findByRole("link", { name: /Unpaid invoices/ })).toBeVisible();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(await screen.findByRole("button", { name: "Ask Assist" })).toBeVisible();

    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    server.use(http.get("*/api/v1/me/home", () => HttpResponse.error()));

    await act(async () => {
      await router.navigate("/");
    });
    await act(async () => {
      await router.navigate("/family");
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Family" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Unpaid invoices/ })).toBeVisible();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.queryByRole("button", { name: "Ask Assist" })).toBeNull();
  });

  it("shows the failed message without crashing when offline with no cached home", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    renderApp("/", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });

    expect(await screen.findByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();
    const nav = screen.getAllByRole("navigation")[0]!;
    const familyLink = await within(nav).findByRole("link", { name: "Family" });

    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    server.use(http.get("*/api/v1/me/home", () => HttpResponse.error()));

    fireEvent.click(familyLink);

    expect(await screen.findByText("Family home could not be loaded.")).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("renders cleanly in pseudo-locale", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    renderApp("/family", { as: persona(TENANT.riverside, "guardian"), modules: MODULES });

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByTestId("last-synced")).toBeVisible();
  });
});
