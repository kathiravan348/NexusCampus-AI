import { TENANT } from "@nexus/mocks";
import { screen } from "@testing-library/react";
import { Globe } from "lucide-react";
import { describe, expect, it } from "vitest";
import { persona, renderApp } from "../test/renderApp";
import { LastSynced } from "./LastSynced";
import type { ModuleEntry } from "./modules";

const AT = Date.parse("2026-11-20T09:30:00Z");

function probe(updatedAt: number): ModuleEntry[] {
  return [
    {
      moduleId: "M01",
      path: "probe",
      navKey: "common.details",
      summaryKey: "common.details",
      icon: Globe,
      permission: null,
      offlineLevel: "L1",
      load: () =>
        Promise.resolve({
          default: () => (
            <div>
              <h1>probe</h1>
              <LastSynced updatedAt={updatedAt} />
            </div>
          ),
        }),
    },
  ];
}

describe("LastSynced", () => {
  it("shows the fetch time in the tenant's time zone", async () => {
    renderApp("/probe", { as: persona(TENANT.littleSteps, "admin"), modules: probe(AT) });
    await screen.findByRole("heading", { name: "probe" });
    // Little Steps: en-IN, Asia/Kolkata (09:30 UTC = 3:00 pm IST).
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced .*3:00/);
  });

  it("renders nothing before the first successful fetch", async () => {
    renderApp("/probe", { as: persona(TENANT.littleSteps, "admin"), modules: probe(0) });
    await screen.findByRole("heading", { name: "probe" });
    expect(screen.queryByTestId("last-synced")).not.toBeInTheDocument();
  });
});
