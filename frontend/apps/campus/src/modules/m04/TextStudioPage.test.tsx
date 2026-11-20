import { TENANT } from "@nexus/mocks";
import { createNexusQueryClient, setMockScenario } from "@nexus/services";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppProviders } from "../../App";
import { MODULES } from "../../app/modules";
import { withInstitutionLocale, freshDb, persona, renderApp, signInAs } from "../../test/renderApp";
import { TextStudioPage } from "./TextStudioPage";

function renderStudioDirectly(as = persona(TENANT.northbridge, "admin")) {
  signInAs(as);
  return render(
    <AppProviders
      db={freshDb()}
      createClient={() => createNexusQueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <TextStudioPage />
      </MemoryRouter>
    </AppProviders>,
  );
}

describe("TextStudioPage (M04)", () => {
  afterEach(() => {
    setMockScenario(null);
    vi.restoreAllMocks();
  });

  it("searches keys, blocks invalid ICU, updates app-wide menu text on save, and rolls back", async () => {
    renderApp("/texts", { as: persona(TENANT.northbridge, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Text & language studio" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();

    const searchInput = screen.getByLabelText("Search keys or text");
    fireEvent.change(searchInput, { target: { value: "term.learner" } });
    const table = screen.getByRole("table");
    expect(await within(table).findByText("term.learner")).toBeInTheDocument();

    // Edit common.shell.home and verify the sidebar navigation updates app-wide
    fireEvent.change(searchInput, { target: { value: "common.shell.home" } });
    fireEvent.click(await within(table).findByRole("button", { name: "Edit" }));

    const dialog = await screen.findByRole("dialog");
    const textarea = within(dialog).getByLabelText("Institution override");
    const saveBtn = within(dialog).getByRole("button", { name: "Save" });

    // Invalid ICU blocked
    fireEvent.change(textarea, { target: { value: "Broken {count, plural, one {x}" } });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/Invalid ICU message/);
    expect(saveBtn).toBeDisabled();

    // Save v1: "Dashboard" -> sidebar Home link updates app-wide
    fireEvent.change(textarea, { target: { value: "Dashboard" } });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);

    await waitFor(() => {
      const nav = screen.getAllByRole("navigation")[0]!;
      expect(within(nav).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    });

    // Save v2: "Overview"
    fireEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]!);
    const dialog2 = await screen.findByRole("dialog");
    fireEvent.change(within(dialog2).getByLabelText("Institution override"), {
      target: { value: "Overview" },
    });
    fireEvent.click(within(dialog2).getByRole("button", { name: "Save" }));
    await waitFor(() => {
      const nav = screen.getAllByRole("navigation")[0]!;
      expect(within(nav).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    });

    // Reopen and roll back to Version 1 ("Dashboard")
    fireEvent.click((await within(table).findAllByRole("button", { name: "Edit" }))[0]!);
    const dialog3 = await screen.findByRole("dialog");
    expect(await within(dialog3).findByText("Version 2")).toBeInTheDocument();
    fireEvent.click(within(dialog3).getByRole("button", { name: "Roll back" }));
    expect(await screen.findByText("Rolled back to version 1.")).toBeInTheDocument();
    fireEvent.click(within(dialog3).getByRole("button", { name: "Cancel" }));

    await waitFor(() => {
      const nav = screen.getAllByRole("navigation")[0]!;
      expect(within(nav).getByRole("link", { name: "Dashboard" })).toBeInTheDocument();
    });
  });

  it("shows group-locked overrides as read-only for Riverside and filters overridden only", async () => {
    renderApp("/texts", { as: persona(TENANT.riverside, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "Text & language studio" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("checkbox", { name: "Overridden only" }));
    const table = screen.getByRole("table");
    const learnerCell = await within(table).findByText("term.learner");
    expect(learnerCell).toBeInTheDocument();
    expect(within(table).getAllByText("Locked by group").length).toBeGreaterThan(0);

    fireEvent.click(within(learnerCell.closest("tr")!).getByRole("button", { name: "View" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Institution override")).toBeDisabled();
    expect(within(dialog).getByText(/Locked by the group override/)).toBeInTheDocument();
  });

  it("lets Apex admin edit Tamil text and hides route from teachers", async () => {
    withInstitutionLocale(TENANT.apex);
    renderApp("/texts", { as: persona(TENANT.apex, "admin"), modules: MODULES });
    expect(
      await screen.findByRole("heading", { level: 1, name: "உரை மற்றும் மொழி ஸ்டுடியோ" }),
    ).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("ta-IN");

    const searchInput = screen.getByLabelText("சாவிகள் அல்லது உரையைத் தேடு");
    fireEvent.change(searchInput, { target: { value: "term.learner" } });
    const table = screen.getByRole("table");
    const learnerCell = await within(table).findByText("term.learner");
    fireEvent.click(within(learnerCell.closest("tr")!).getByRole("button", { name: "திருத்து" }));

    const dialog = await screen.findByRole("dialog");
    const textarea = within(dialog).getByLabelText("நிறுவன மேலெழுதல்");
    expect(textarea).toHaveAttribute("dir", "ltr");
    fireEvent.change(textarea, { target: { value: "சிறந்த பயிற்சியாளர்" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "சேமி" }));

    await waitFor(() => {
      expect(
        within(screen.getByRole("table")).getByText("சிறந்த பயிற்சியாளர்"),
      ).toBeInTheDocument();
    });

    // Teacher cannot access /texts
    renderApp("/texts", { as: persona(TENANT.riverside, "teacher"), modules: MODULES });
    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("supports L1 offline reading with disabled writes and recovers from error state", async () => {
    const spy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    renderStudioDirectly();
    expect(
      await screen.findByRole("heading", { level: 1, name: "Text & language studio" }),
    ).toBeInTheDocument();

    spy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });
    expect(await screen.findByText(/Cached texts can be browsed/)).toBeInTheDocument();
    spy.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    setMockScenario("error");
    renderStudioDirectly();
    expect(
      await screen.findByRole("heading", { name: "Could not load text overrides." }),
    ).toBeInTheDocument();

    setMockScenario(null);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Text & language studio" }),
    ).toBeInTheDocument();
  });
});
