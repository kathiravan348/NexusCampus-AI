import { TENANT, USER, mockDb } from "@nexus/mocks";
import { server } from "@nexus/mocks/node";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { LOCALE_STORAGE_KEY } from "../../app/TenantRuntime";
import { persona, renderApp } from "../../test/renderApp";

function openLearners(role: "admin" | "teacher" | "guardian" | "learner" = "admin") {
  return renderApp("/learners", {
    as: persona(TENANT.riverside, role),
    modules: MODULES,
  });
}

describe("LearnersPage (M13)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
  });

  it("lists tenant learners for an admin, searches, and opens a profile", async () => {
    openLearners("admin");

    expect(await screen.findByRole("heading", { level: 1, name: "Learners" })).toBeInTheDocument();
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(await screen.findByTestId("last-synced")).toHaveTextContent(/^Last synced /);

    const list = await screen.findByRole("list", { name: "Learners" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(within(list).getByText("Oliver Bennett")).toBeInTheDocument();
    expect(within(list).getByText("RV-2026-0001")).toBeInTheDocument();
    expect(within(list).getByText("Ella Price")).toBeInTheDocument();

    const search = screen.getByRole("searchbox", { name: "Search learners" });
    fireEvent.change(search, { target: { value: "0002" } });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("Mia Bennett")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "Ella" } });
    expect(within(list).getAllByRole("listitem")).toHaveLength(1);
    expect(within(list).getByText("Ella Price")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "no-match-xyz" } });
    expect(screen.getByText("No learners match")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "" } });
    const fullList = screen.getByRole("list", { name: "Learners" });
    fireEvent.click(within(fullList).getByText("Ella Price"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Ella Price" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back to learners" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Learners" })).toBeInTheDocument();
  });

  it("shows learner numbers only when people are absent from the directory", async () => {
    server.use(
      http.get("*/api/v1/people", () =>
        HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100, hasMore: false }),
      ),
    );
    openLearners("admin");

    const list = await screen.findByRole("list", { name: "Learners" });
    expect(within(list).getByText("RV-2026-0001")).toBeInTheDocument();
    expect(within(list).queryByText("Oliver Bennett")).not.toBeInTheDocument();
  });

  it("scopes a guardian to their own children only", async () => {
    openLearners("guardian");

    const list = await screen.findByRole("list", { name: "Learners" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("Oliver Bennett")).toBeInTheDocument();
    expect(within(list).getByText("Mia Bennett")).toBeInTheDocument();
    expect(within(list).queryByText("Leo Shah")).not.toBeInTheDocument();
    expect(within(list).queryByText("Ella Price")).not.toBeInTheDocument();
  });

  it("shows the no-access message when the server refuses with 403", async () => {
    mockDb.roleAssignments = mockDb.roleAssignments.filter((row) => row.userId !== USER.rvHelen);
    openLearners("admin");

    expect(await screen.findByRole("heading", { name: "No access" })).toBeInTheDocument();
  });

  it("keeps cached learners with last synced while offline and supports pseudo-locale", async () => {
    const onlineSpy = vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    openLearners("admin");

    expect(await screen.findByText("Oliver Bennett")).toBeInTheDocument();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);

    onlineSpy.mockReturnValue(false);
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByText("Oliver Bennett")).toBeInTheDocument();
    expect(screen.getByTestId("last-synced")).toHaveTextContent(/^Last synced /);
  });

  it("renders cleanly in pseudo-locale (en-XA)", async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify({ [TENANT.riverside]: "en-XA" }));
    openLearners("admin");

    const heading = await screen.findByRole("heading", { level: 1 });
    expect(heading.textContent).toMatch(/^⟦.*⟧$/);
    expect(await screen.findByText("Oliver Bennett")).toBeInTheDocument();
  });
});
