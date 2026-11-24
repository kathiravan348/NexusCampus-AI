import { LEARNER, PERSON, TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { ChildSwitcher, type ChildSwitcherProps } from "./ChildSwitcher";

function renderSwitcher(
  path: string,
  props: ChildSwitcherProps,
  who = persona(TENANT.riverside, "guardian"),
) {
  signInAs(who);
  const routes = [{ path: "/family", element: <ChildSwitcher {...props} /> }];
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </AppProviders>,
  );
  return { ...view, router };
}

describe("ChildSwitcher", () => {
  it("lists children, defaults unknown query ids, and updates the URL", async () => {
    const first = mockDb.people.find((row) => row.id === PERSON.rvOliver)!;
    const second = mockDb.people.find((row) => row.id === PERSON.rvMia)!;
    const ids = [LEARNER.rvOliver, LEARNER.rvMia];
    const { router } = renderSwitcher("/family?child=unknown-id", { learnerIds: ids });

    const select = await screen.findByLabelText("Child");
    await within(select).findByRole("option", { name: first.legalName });
    expect(within(select).getByRole("option", { name: second.legalName })).toBeInTheDocument();
    expect(select).toHaveValue(LEARNER.rvOliver);

    fireEvent.change(select, { target: { value: LEARNER.rvMia } });
    expect(select).toHaveValue(LEARNER.rvMia);
    expect(router.state.location.search).toBe(`?child=${LEARNER.rvMia}`);
  });

  it("falls back to the learner number and then generic child label", async () => {
    const learner = mockDb.learners.find((row) => row.id === LEARNER.rvOliver)!;
    server.use(
      http.get("*/api/v1/people", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
      ),
    );
    const firstRender = renderSwitcher("/family", { learnerIds: [LEARNER.rvOliver] });
    expect(await screen.findByText(learner.learnerNumber)).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
    firstRender.unmount();

    server.use(
      http.get("*/api/v1/learners", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
      ),
    );
    renderSwitcher("/family", { learnerIds: [LEARNER.rvOliver] });
    expect(await screen.findByText("Child")).toBeVisible();
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("shows quick links only for modules visible in navigation", async () => {
    const ids = [LEARNER.rvOliver, LEARNER.rvMia];
    const firstRender = renderSwitcher("/family", { learnerIds: ids });
    const nav = await screen.findByRole("navigation", { name: "Child pages" });
    const feesLink = await within(nav).findByRole("link", { name: "Fees" });
    expect(feesLink).toHaveAttribute("href", "/fees");
    expect(within(nav).getByRole("link", { name: "Report cards" })).toHaveAttribute(
      "href",
      "/report-cards",
    );
    expect(within(nav).getByRole("link", { name: "Issued documents" })).toHaveAttribute(
      "href",
      "/documents",
    );
    expect(within(nav).queryByRole("link", { name: "Attendance" })).toBeNull();
    firstRender.unmount();

    const guardian = persona(TENANT.riverside, "guardian");
    const role = mockDb.roles.find((row) => row.id === guardian.roleId)!;
    role.permissions = [...role.permissions, "m17.attendance.read"];
    const feesEntitlement = mockDb.entitlements.find(
      (row) => row.tenantId === TENANT.riverside && row.moduleId === "M18",
    )!;
    feesEntitlement.source = "plan";
    feesEntitlement.enabled = false;

    renderSwitcher("/family", { learnerIds: ids }, guardian);
    const updatedNav = await screen.findByRole("navigation", { name: "Child pages" });
    const attendanceLink = await within(updatedNav).findByRole("link", { name: "Attendance" });
    expect(attendanceLink).toHaveAttribute("href", "/attendance");
    expect(within(updatedNav).queryByRole("link", { name: "Fees" })).toBeNull();
  });
});
