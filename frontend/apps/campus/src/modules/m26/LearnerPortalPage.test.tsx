import { PERSON, TENANT, USER, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

describe("LearnerPortalPage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("shows summary cards, visible quick links, and Assist for a university learner", async () => {
    const viewer = persona(TENANT.northbridge, "learner");
    expect(viewer.userId).toBe(USER.nbJordan);
    const person = mockDb.people.find((row) => row.id === PERSON.nbJordan)!;
    const learner = mockDb.learners.find((row) => row.personId === PERSON.nbJordan)!;

    renderApp("/learner", { as: viewer, modules: MODULES });

    expect(await screen.findByRole("heading", { level: 1, name: "My portal" })).toBeVisible();
    expect(screen.getByRole("note")).toBeVisible();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.queryByText("Totals for all your children")).toBeNull();

    const main = screen.getByRole("main");
    expect(within(main).queryByText(person.legalName)).toBeNull();
    expect(within(main).queryByText(learner.learnerNumber)).toBeNull();

    const cards = screen.getByRole("list", { name: "Summary cards" });
    const attendanceCard = within(cards).getByRole("link", { name: /Attendance/ });
    expect(attendanceCard).toHaveAttribute("href", "/attendance");
    expect(within(attendanceCard).getByText(/^\d+$/)).toBeVisible();

    const feesCard = within(cards).getByRole("link", { name: /Unpaid invoices/ });
    expect(feesCard).toHaveAttribute("href", "/fees");
    expect(within(feesCard).getByText(/^\d+$/)).toBeVisible();

    const messagesCard = within(cards).getByRole("link", { name: /Unread messages/ });
    expect(messagesCard).toHaveAttribute("href", "/messages");
    expect(within(messagesCard).getByText(/^\d+$/)).toBeVisible();

    const noticesCard = within(cards).getByRole("link", { name: /Notices/ });
    expect(noticesCard).toHaveAttribute("href", "/notices");
    expect(within(noticesCard).getByText(/^\d+$/)).toBeVisible();

    const quickNav = screen.getByRole("navigation", { name: "Quick links" });
    expect(within(quickNav).getByRole("link", { name: "Timetable" })).toHaveAttribute(
      "href",
      "/timetable",
    );
    expect(within(quickNav).getByRole("link", { name: "Report cards" })).toHaveAttribute(
      "href",
      "/report-cards",
    );
    expect(within(quickNav).getByRole("link", { name: "Issued documents" })).toHaveAttribute(
      "href",
      "/documents",
    );
    expect(within(quickNav).getByRole("link", { name: "Messages & notices" })).toHaveAttribute(
      "href",
      "/messages",
    );
    expect(within(quickNav).queryByRole("link", { name: "Attendance" })).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: "Ask Assist" }));
    const dialog = await screen.findByRole("dialog", { name: "Nexus Assist" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));

    fireEvent.click(feesCard);
    expect(await screen.findByRole("heading", { level: 1, name: "Fees" })).toBeVisible();
  });

  it("shows summary cards and quick links for a coaching centre learner", async () => {
    const viewer = persona(TENANT.apex, "learner");
    expect(viewer.userId).toBe(USER.axArun);
    const person = mockDb.people.find((row) => row.id === PERSON.axArun)!;
    const learner = mockDb.learners.find((row) => row.personId === PERSON.axArun)!;

    renderApp("/learner", { as: viewer, modules: MODULES });

    expect(await screen.findByRole("heading", { level: 1, name: "My portal" })).toBeVisible();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.queryByText("Totals for all your children")).toBeNull();

    const main = screen.getByRole("main");
    expect(within(main).queryByText(person.legalName)).toBeNull();
    expect(within(main).queryByText(learner.learnerNumber)).toBeNull();

    const cards = screen.getByRole("list", { name: "Summary cards" });
    const messagesCard = within(cards).getByRole("link", { name: /Unread messages/ });
    expect(messagesCard).toHaveAttribute("href", "/messages");
    expect(within(messagesCard).getByText(/^\d+$/)).toBeVisible();
    expect(within(cards).getByRole("link", { name: /Attendance/ })).toHaveAttribute(
      "href",
      "/attendance",
    );
    expect(within(cards).getByRole("link", { name: /Unpaid invoices/ })).toHaveAttribute(
      "href",
      "/fees",
    );
    expect(within(cards).getByRole("link", { name: /Notices/ })).toHaveAttribute(
      "href",
      "/notices",
    );

    const quickNav = screen.getByRole("navigation", { name: "Quick links" });
    expect(within(quickNav).getByRole("link", { name: "Timetable" })).toHaveAttribute(
      "href",
      "/timetable",
    );
    expect(within(quickNav).getByRole("link", { name: "Report cards" })).toHaveAttribute(
      "href",
      "/report-cards",
    );
    expect(within(quickNav).getByRole("link", { name: "Issued documents" })).toHaveAttribute(
      "href",
      "/documents",
    );
    expect(within(quickNav).getByRole("link", { name: "Messages & notices" })).toHaveAttribute(
      "href",
      "/messages",
    );
    expect(within(quickNav).queryByRole("link", { name: "Attendance" })).toBeNull();

    fireEvent.click(messagesCard);
    expect(
      await screen.findByRole("heading", { level: 1, name: "Messages & notices" }),
    ).toBeVisible();
  });

  it("shows the no-access message for non-learner roles and forbidden responses", async () => {
    for (const role of ["guardian", "teacher", "admin"] as const) {
      const view = renderApp("/learner", {
        as: persona(TENANT.northbridge, role),
        modules: MODULES,
      });
      expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
      expect(screen.queryByRole("heading", { level: 1, name: "My portal" })).toBeNull();
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
    renderApp("/learner", { as: persona(TENANT.northbridge, "learner"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeVisible();
  });

  it("renders cached portal data with last synced while offline and hides Assist", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const { router } = renderApp("/learner", {
      as: persona(TENANT.northbridge, "learner"),
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
      await router.navigate("/learner");
    });

    expect(await screen.findByRole("heading", { level: 1, name: "My portal" })).toBeVisible();
    expect(screen.getByRole("link", { name: /Unpaid invoices/ })).toBeVisible();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
    expect(screen.queryByRole("button", { name: "Ask Assist" })).toBeNull();
  });

  it("shows the failed message without crashing when offline with no cached home", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    renderApp("/", { as: persona(TENANT.northbridge, "learner"), modules: MODULES });

    expect(await screen.findByRole("heading", { level: 1, name: /Welcome/ })).toBeVisible();
    const nav = screen.getAllByRole("navigation")[0]!;
    const portalLink = await within(nav).findByRole("link", { name: "My portal" });

    online.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    server.use(http.get("*/api/v1/me/home", () => HttpResponse.error()));

    fireEvent.click(portalLink);

    expect(await screen.findByText("Your portal could not be loaded.")).toBeVisible();
    expect(screen.getByRole("alert")).toBeVisible();
  });

  it("renders cleanly in pseudo-locale", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.northbridge]: "en-XA" }));
    renderApp("/learner", { as: persona(TENANT.northbridge, "learner"), modules: MODULES });

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByTestId("last-synced")).toBeVisible();
  });
});
