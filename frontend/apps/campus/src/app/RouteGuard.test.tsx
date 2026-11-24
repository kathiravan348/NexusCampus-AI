import type { RoleProfileKind } from "@nexus/contracts";
import { TENANT } from "@nexus/mocks";
import { screen, waitFor } from "@testing-library/react";
import { Wifi } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES, type ModuleEntry } from "./modules";
import { persona, renderApp, TEST_MODULES } from "../test/renderApp";

// Synthetic /me profiles exercise the audience rule without permission grants.
interface TestProfile {
  tenantId: string;
  kind: RoleProfileKind;
  status: "active" | "inactive";
}

let profiles: TestProfile[] | undefined;
vi.mock("@nexus/services", async (importOriginal) => {
  const services = await importOriginal<typeof import("@nexus/services")>();
  return {
    ...services,
    useMe() {
      const me = services.useMe();
      if (!profiles || !me.data) return me;
      return { ...me, data: { ...me.data, permissions: [], roleProfiles: profiles } };
    },
  };
});

const ONLINE_ONLY_MODULE: ModuleEntry = {
  moduleId: "M01",
  path: "online-only",
  navKey: "common.details",
  summaryKey: "common.details",
  icon: Wifi,
  permission: null,
  offlineLevel: "L0",
  load: () => Promise.resolve({ default: () => <p>online-only screen</p> }),
};

describe("RouteGuard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects unauthenticated visitors to sign-in", async () => {
    renderApp("/people");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Sign in to a demo institution" }),
    ).toBeInTheDocument();
  });

  it("shows ModuleOff when the tenant plan does not include the module", async () => {
    renderApp("/unplanned", { as: persona(TENANT.littleSteps, "admin") });
    expect(await screen.findByRole("heading", { name: "Not in your plan" })).toBeInTheDocument();
  });

  it("shows Forbidden when the signed-in persona lacks the module permission", async () => {
    renderApp("/people", { as: persona(TENANT.littleSteps, "guardian") });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("renders the module screen when entitled and permitted", async () => {
    renderApp("/people", { as: persona(TENANT.littleSteps, "admin") });
    expect(await screen.findByText("people screen")).toBeInTheDocument();
  });

  it("shows an offline notice for L0 modules when the device is offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderApp("/online-only", {
      as: persona(TENANT.littleSteps, "admin"),
      modules: [...TEST_MODULES, ONLINE_ONLY_MODULE],
    });
    expect(await screen.findByRole("heading", { name: "Needs a connection" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/");
  });
});

describe("module audience", () => {
  afterEach(() => {
    profiles = undefined;
  });

  const tenantId = TENANT.littleSteps;
  const modules = MODULES.filter((entry) => entry.moduleId >= "M13" && entry.moduleId <= "M28");

  async function expectMenu(
    signInAs: Parameters<typeof persona>[1],
    shown: readonly string[],
    hidden: readonly string[],
  ) {
    renderApp("/", { as: persona(tenantId, signInAs), modules });
    await waitFor(() => {
      const paths = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
      for (const path of shown) expect(paths).toContain(path);
      for (const path of hidden) expect(paths).not.toContain(path);
    });
  }

  it("shows the admin's permitted screens and dashboard", async () => {
    await expectMenu(
      "admin",
      ["/fees", "/exams", "/report-cards", "/documents", "/dashboards"],
      ["/family", "/learner", "/staff"],
    );
  });

  it("shows teachers the staff portal", async () => {
    await expectMenu("teacher", ["/staff", "/messages"], ["/fees", "/family", "/learner"]);
  });

  it("shows guardians the family screens and portal", async () => {
    await expectMenu(
      "guardian",
      ["/learners", "/families", "/fees", "/exams", "/report-cards", "/documents", "/family"],
      ["/learner", "/staff"],
    );
  });

  it("shows learners their own screens and portal", async () => {
    // Little Steps has no learner sign-in. Supply a learner profile on its guardian session.
    profiles = [{ tenantId, kind: "learner", status: "active" }];
    await expectMenu(
      "guardian",
      ["/learners", "/fees", "/exams", "/report-cards", "/documents", "/learner"],
      ["/families", "/family", "/staff"],
    );
  });

  it("gives the staff portal priority over the family portal", async () => {
    profiles = [
      { tenantId, kind: "guardian", status: "active" },
      { tenantId, kind: "staff", status: "active" },
    ];
    await expectMenu("guardian", ["/staff"], ["/family", "/learner", "/fees"]);
  });

  it("ignores foreign staff and only grants access for an active profile", async () => {
    profiles = [
      { tenantId, kind: "guardian", status: "inactive" },
      { tenantId, kind: "learner", status: "active" },
      { tenantId: "other-tenant", kind: "staff", status: "active" },
    ];
    await expectMenu("guardian", ["/fees"], ["/families", "/family", "/learner", "/staff"]);
  });

  it("excludes family access for a guardian with an inactive staff profile", async () => {
    profiles = [
      { tenantId, kind: "guardian", status: "active" },
      { tenantId, kind: "staff", status: "inactive" },
    ];
    await expectMenu("guardian", ["/messages"], ["/fees", "/family", "/learner", "/staff"]);
  });

  it("shows Forbidden when a guardian opens the staff portal directly", async () => {
    renderApp("/staff", { as: persona(tenantId, "guardian"), modules });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });
});
