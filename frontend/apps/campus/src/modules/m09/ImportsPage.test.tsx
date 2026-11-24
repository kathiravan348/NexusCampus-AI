import { TENANT, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openImports(
  role: "admin" | "teacher" | "guardian" | "learner" = "admin",
  path = "/import",
) {
  return renderApp(path, {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

describe("ImportsPage (M09)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("lists jobs, opens mappings and issues, opens Assist, and registers a CSV job", async () => {
    openImports("admin");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Import data" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();

    const list = await screen.findByRole("list", { name: "Import jobs" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("guardians-intake.xlsx")).toBeInTheDocument();
    expect(within(list).getByText("learners-2026.csv")).toBeInTheDocument();
    expect(within(list).getByText("Dry run ready")).toBeInTheDocument();
    expect(within(list).getByText("Completed")).toBeInTheDocument();
    expect(within(list).getByText("5 valid · 1 error · 6 total")).toBeInTheDocument();

    fireEvent.click(within(list).getByText("guardians-intake.xlsx"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "guardians-intake.xlsx" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Guardian Name")).toBeInTheDocument();
    expect(await screen.findByText("Phone number is not in a valid format.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to imports" }));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Import data" }),
    ).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Ask Assist" }));
    const assistDialog = await screen.findByRole("dialog", { name: "Nexus Assist" });
    fireEvent.click(within(assistDialog).getByRole("button", { name: "Close" }));

    fireEvent.click(screen.getByRole("button", { name: "New import" }));
    const dialog = await screen.findByRole("dialog", { name: "New import" });
    const file = new File(["Name\nSample"], "learners.csv", { type: "text/csv" });
    fireEvent.change(within(dialog).getByLabelText(/Spreadsheet file/), {
      target: { files: [file] },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Register import" }));

    expect(await screen.findByText("learners.csv")).toBeInTheDocument();
    const updatedList = await screen.findByRole("list", { name: "Import jobs" });
    expect(within(updatedList).getByText("learners.csv")).toBeInTheDocument();
    expect(within(updatedList).getByText("Uploaded")).toBeInTheDocument();
  });

  it.each(["teacher", "guardian"] as const)(
    "blocks a %s without import read permission via the route guard",
    async (role) => {
      openImports(role);
      expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
    },
  );

  it("hides the New import button for a viewer with read-only import permission", async () => {
    const teacherRole = mockDb.roles.find(
      (row) => row.tenantId === TENANT.riverside && row.id === "role-rv-teacher",
    )!;
    teacherRole.permissions.push("m09.import.read");

    openImports("teacher");

    expect(
      await screen.findByRole("heading", { level: 1, name: "Import data" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("guardians-intake.xlsx")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New import" })).not.toBeInTheDocument();
  });

  it("shows the L0 offline notice when offline", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    openImports("admin");

    expect(await screen.findByRole("heading", { name: "Needs a connection" })).toBeInTheDocument();
  });

  it("shows an empty state when no import jobs exist", async () => {
    server.use(
      http.get("*/api/v1/import-jobs", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 200 }),
      ),
    );
    openImports("admin");
    expect(await screen.findByText("No import jobs yet")).toBeInTheDocument();
  });

  it("shows an error state when loading import jobs fails", async () => {
    server.use(
      http.get("*/api/v1/import-jobs", () =>
        HttpResponse.json(
          { error: { code: "internal", message: "Something went wrong." } },
          { status: 500 },
        ),
      ),
    );
    openImports("admin");
    expect(await screen.findByText("Import jobs could not be loaded.")).toBeInTheDocument();
  });

  it("shows a not-found state for an unknown job query parameter", async () => {
    openImports("admin", "/import?job=imp-missing");
    expect(await screen.findByText("Import job not found")).toBeInTheDocument();
  });

  it("renders cleanly in pseudo-locale (en-XA)", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openImports("admin");

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByText("guardians-intake.xlsx")).toBeInTheDocument();
  });
});
