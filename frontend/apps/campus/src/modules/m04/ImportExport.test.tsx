import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient } from "@nexus/services";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { freshDb, persona, signInAs } from "../../test/renderApp";
import { ImportExport } from "./ImportExport";

function renderImportExport(as = persona(TENANT.northbridge, "admin"), online = true) {
  signInAs(as);
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <ImportExport
          locale="en-US"
          localeLabel="English (United States) (en-US)"
          institutionOverrides={[]}
          online={online}
        />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("ImportExport", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports JSON overrides as a file download", async () => {
    const createUrl = vi.fn(() => "blob:test-export");
    const revokeUrl = vi.fn();
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    Object.defineProperty(URL, "createObjectURL", { value: createUrl, configurable: true });
    Object.defineProperty(URL, "revokeObjectURL", { value: revokeUrl, configurable: true });
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    try {
      renderImportExport();
      fireEvent.click(await screen.findByRole("button", { name: "Export JSON" }));
      expect(createUrl).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeUrl).toHaveBeenCalledWith("blob:test-export");
      expect(await screen.findByText(/Overrides exported/)).toBeInTheDocument();
    } finally {
      Object.defineProperty(URL, "createObjectURL", { value: origCreate, configurable: true });
      Object.defineProperty(URL, "revokeObjectURL", { value: origRevoke, configurable: true });
    }
  });

  it("validates malformed JSON, previews adds/changes/rejects on dry run, and applies valid rows", async () => {
    const nb = persona(TENANT.northbridge, "admin");
    await fetch("http://localhost/api/v1/texts/overrides/term.learner?locale=en-US", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Nexus-Tenant": nb.tenantId,
        "X-Nexus-User": nb.userId,
      },
      body: JSON.stringify({ message: "Scholar" }),
    });

    renderImportExport(nb);
    const jsonBox = await screen.findByLabelText("Overrides JSON");

    // Malformed JSON rejected client-side
    fireEvent.change(jsonBox, { target: { value: "{not json" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/Invalid JSON/);

    // Mixed valid + invalid ICU + unknown key
    fireEvent.change(jsonBox, {
      target: {
        value: JSON.stringify({
          "common.save": "Store",
          "term.learner": "Fellow",
          "common.syncPending": "{count, plural, one {broken",
          "common.notARealKey": "Nope",
        }),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Preview changes" }));

    expect(await screen.findByText("Dry-run diff preview")).toBeInTheDocument();
    expect(screen.getByText("1 added")).toBeInTheDocument();
    expect(screen.getByText("1 changed")).toBeInTheDocument();
    expect(screen.getByText("2 rejected")).toBeInTheDocument();
    expect(screen.getByText("Invalid ICU message syntax")).toBeInTheDocument();
    expect(screen.getByText("Unknown message key")).toBeInTheDocument();

    // Apply applies only the 2 valid changes
    fireEvent.click(screen.getByRole("button", { name: "Apply valid changes" }));
    expect(await screen.findByText("Applied 2 text overrides")).toBeInTheDocument();
  });
});
