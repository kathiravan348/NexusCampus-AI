import type { ModuleId } from "@nexus/contracts";
import { TENANT, mockDb } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { QuickLinks, type QuickLinksProps } from "./QuickLinks";

function renderQuickLinks(
  props: QuickLinksProps = {},
  who = persona(TENANT.northbridge, "learner"),
) {
  signInAs(who);
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <div data-testid="quick-links-host">
          <QuickLinks {...props} />
        </div>
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("QuickLinks", () => {
  it("shows visible nav links in a single-column mobile grid", async () => {
    renderQuickLinks();

    const nav = await screen.findByRole("navigation", { name: "Quick links" });
    const list = within(nav).getByRole("list");
    expect(list).toHaveClass("grid-cols-1");

    const timetable = await within(nav).findByRole("link", { name: "Timetable" });
    expect(timetable).toHaveAttribute("href", "/timetable");
    expect(timetable).toHaveClass("min-h-11");

    expect(within(nav).getByRole("link", { name: "Report cards" })).toHaveAttribute(
      "href",
      "/report-cards",
    );
    expect(within(nav).getByRole("link", { name: "Issued documents" })).toHaveAttribute(
      "href",
      "/documents",
    );
    expect(within(nav).getByRole("link", { name: "Messages & notices" })).toHaveAttribute(
      "href",
      "/messages",
    );
    expect(within(nav).queryByRole("link", { name: "Attendance" })).toBeNull();
  });

  it("updates visible links when permissions and module entitlements change", async () => {
    const learner = persona(TENANT.northbridge, "learner");
    const role = mockDb.roles.find((row) => row.id === learner.roleId)!;
    role.permissions = [...role.permissions, "m17.attendance.read"];
    const documentsEntitlement = mockDb.entitlements.find(
      (row) => row.tenantId === TENANT.northbridge && row.moduleId === "M23",
    )!;
    documentsEntitlement.source = "plan";
    documentsEntitlement.enabled = false;

    renderQuickLinks({}, learner);

    const nav = await screen.findByRole("navigation", { name: "Quick links" });
    const attendance = await within(nav).findByRole("link", { name: "Attendance" });
    expect(attendance).toHaveAttribute("href", "/attendance");
    expect(within(nav).queryByRole("link", { name: "Issued documents" })).toBeNull();
  });

  it("renders nothing when none of the quick-link modules are visible", async () => {
    const visibleModuleIds = new Set<ModuleId>(["M01", "M18"]);
    renderQuickLinks({ visibleModuleIds });

    const host = await screen.findByTestId("quick-links-host");
    expect(host).toBeEmptyDOMElement();
    expect(screen.queryByRole("navigation", { name: "Quick links" })).toBeNull();
  });

  it("respects an explicit visible module set", async () => {
    renderQuickLinks({ visibleModuleIds: new Set<ModuleId>(["M16", "M24"]) });

    const nav = await screen.findByRole("navigation", { name: "Quick links" });
    const links = within(nav).getAllByRole("link");
    expect(links).toHaveLength(2);
    expect(within(nav).getByRole("link", { name: "Timetable" })).toHaveAttribute(
      "href",
      "/timetable",
    );
    expect(within(nav).getByRole("link", { name: "Messages & notices" })).toHaveAttribute(
      "href",
      "/messages",
    );
  });
});
