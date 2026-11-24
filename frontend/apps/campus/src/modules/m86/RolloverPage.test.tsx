import { I18nProvider } from "@nexus/i18n";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RolloverPage } from "./RolloverPage";

const state = vi.hoisted(() => ({
  online: true,
  permissions: ["m86.rollover.read", "m11.assist.use"],
  ai: true,
  error: null as Error | null,
  runs: undefined as { items: { id: string; createdAt: string }[] } | undefined,
  decisionCache: true,
  Denied: class extends Error {
    status = 403;
  },
  queried: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("@nexus/services", () => ({
  ApiRequestError: state.Denied,
  useMe: () => ({ data: { permissions: state.permissions }, refetch: state.retry }),
  useRolloverRuns: () => ({
    data: state.runs,
    error: state.error,
    isError: !!state.error,
    dataUpdatedAt: 42,
    refetch: state.retry,
  }),
  useRolloverDecisions: (id: string | null) => {
    state.queried(id);
    return { data: state.decisionCache ? { items: [] } : undefined, refetch: state.retry };
  },
  useEntitlements: () => ({ data: { items: [{ moduleId: "M11", enabled: true }] } }),
  useAiSettings: () => ({ data: { enabled: state.ai } }),
}));
vi.mock("../../app/RouteGuard", () => ({ useOnline: () => state.online }));
vi.mock("../../app/LastSynced", () => ({
  LastSynced: ({ updatedAt }: { updatedAt: number }) => <time>{updatedAt}</time>,
}));
vi.mock("../../pages/Forbidden", () => ({ Forbidden: () => <p>No access</p> }));
vi.mock("../m11/AssistPanel", () => ({
  AssistPanel: ({ open }: { open: boolean }) => (open ? <div role="dialog" /> : null),
}));
vi.mock("./RolloverRunList", () => ({
  RolloverRunList: ({
    selectedId,
    onSelect,
  }: {
    selectedId: string;
    onSelect: (id: string) => void;
  }) => <button onClick={() => onSelect("earlier")}>{selectedId}</button>,
}));
vi.mock("./PromotionDecisions", () => ({
  PromotionDecisions: ({
    action,
    onAction,
  }: {
    action: string;
    onAction: (action: string) => void;
  }) => <button onClick={() => onAction("skip")}>{action || "All"}</button>,
}));

function Location() {
  return <output>{useLocation().search}</output>;
}

function open(search = "") {
  return render(
    <I18nProvider locale="en">
      <MemoryRouter initialEntries={["/rollover" + search]}>
        <RolloverPage />
        <Location />
      </MemoryRouter>
    </I18nProvider>,
  );
}

beforeEach(() => {
  state.online = true;
  state.permissions = ["m86.rollover.read", "m11.assist.use"];
  state.ai = true;
  state.error = null;
  state.runs = {
    items: [
      { id: "earlier", createdAt: "2025-03-01T00:00:00Z" },
      { id: "latest", createdAt: "2026-03-01T00:00:00Z" },
    ],
  };
  state.decisionCache = true;
  vi.clearAllMocks();
});
afterEach(cleanup);

it("restores the run and action from the address after a reload", () => {
  const page = open("?run=unknown&action=graduate");
  expect(screen.getByRole("button", { name: "latest" })).toBeTruthy();
  expect(state.queried).toHaveBeenCalledWith("latest");
  fireEvent.click(screen.getByRole("button", { name: "latest" }));
  fireEvent.click(screen.getByRole("button", { name: "graduate" }));
  const search = screen.getByRole("status").textContent ?? "";
  expect(new URLSearchParams(search).get("run")).toBe("earlier");
  expect(new URLSearchParams(search).get("action")).toBe("skip");
  page.unmount();
  open(search);
  expect(screen.getByRole("button", { name: "earlier" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "skip" })).toBeTruthy();
});

it("opens Assist only when available", () => {
  open();
  fireEvent.click(screen.getByRole("button", { name: "Ask Assist" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
});

it("denies access before exposing cached decisions", () => {
  state.permissions = [];
  open();
  expect(screen.getByText("No access")).toBeTruthy();
  expect(state.queried).toHaveBeenCalledWith(null);
  expect(screen.queryByText("Year-end rollover")).toBeNull();
});

it("hides cached runs after a forbidden response", () => {
  state.error = new state.Denied();
  open();
  expect(screen.getByText("No access")).toBeTruthy();
  expect(screen.queryByText("Year-end rollover")).toBeNull();
});

it("restores cached decisions and their selected action offline", () => {
  state.online = false;
  open("?run=earlier&action=skip");
  expect(screen.getByRole("button", { name: "earlier" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "skip" })).toBeTruthy();
  expect(screen.getByText("42")).toBeTruthy();
  expect(screen.queryByText("Ask Assist")).toBeNull();
});

it("keeps cached runs readable offline and reports uncached decisions", () => {
  state.online = false;
  state.decisionCache = false;
  open();
  expect(screen.getByRole("button", { name: "latest" })).toBeTruthy();
  expect(screen.getByText("42")).toBeTruthy();
  expect(screen.getByText("Year-end rollover could not be loaded.")).toBeTruthy();
  expect(screen.queryByText("Ask Assist")).toBeNull();
});

it("shows the failure state offline before any runs are cached", () => {
  state.online = false;
  state.runs = undefined;
  open();
  expect(screen.getByText("Year-end rollover could not be loaded.")).toBeTruthy();
});

it("distinguishes an empty run list from a pending request", () => {
  state.runs = undefined;
  const page = open();
  expect(screen.getByRole("status", { name: "Loading…" })).toBeTruthy();
  page.unmount();
  state.runs = { items: [] };
  open();
  expect(screen.getByText("No rollover runs yet.")).toBeTruthy();
});
