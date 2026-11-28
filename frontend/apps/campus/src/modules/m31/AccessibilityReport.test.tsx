import type { AccessibilityCheck } from "@nexus/contracts";
import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { AccessibilityReport } from "./AccessibilityReport";

function renderReport(accessibility: AccessibilityCheck | null) {
  signInAs(persona(TENANT.riverside, "teacher"));
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <AccessibilityReport accessibility={accessibility} />
    </AppProviders>,
  );
}

describe("AccessibilityReport (M31)", () => {
  it("shows Not checked when accessibility is null", () => {
    renderReport(null);

    expect(
      screen.getByRole("heading", { level: 3, name: "Accessibility check" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Not checked")).toBeInTheDocument();
    expect(screen.getByText("Run an accessibility check before publishing.")).toBeInTheDocument();
  });

  it("shows the check time and clean state when there are no issues", () => {
    renderReport({ checkedAt: "2026-08-20T10:30:00Z", issues: [] });

    expect(screen.getByText(/^Checked /)).toBeInTheDocument();
    expect(screen.getByText("No accessibility issues found")).toBeInTheDocument();
  });

  it("orders errors before warnings with translated codes and locations", () => {
    renderReport({
      checkedAt: "2026-08-20T10:30:00Z",
      issues: [
        { code: "heading_order", blockIndex: 0, severity: "warning" },
        { code: "missing_captions", blockIndex: null, severity: "error" },
        { code: "missing_alt_text", blockIndex: 2, severity: "error" },
      ],
    });

    expect(screen.getByText("2 errors")).toBeInTheDocument();
    expect(screen.getByText("1 warning")).toBeInTheDocument();

    const list = screen.getByRole("list");
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);

    expect(rows[0]).toHaveTextContent("Error");
    expect(rows[0]).toHaveTextContent("Missing video captions");
    expect(rows[0]).toHaveTextContent("Whole item");

    expect(rows[1]).toHaveTextContent("Error");
    expect(rows[1]).toHaveTextContent("Missing alt text");
    expect(rows[1]).toHaveTextContent("Block 3");

    expect(rows[2]).toHaveTextContent("Warning");
    expect(rows[2]).toHaveTextContent("Skipped heading level");
    expect(rows[2]).toHaveTextContent("Block 1");
  });
});
