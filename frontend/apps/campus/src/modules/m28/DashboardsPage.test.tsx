import type { Kpi } from "@nexus/contracts";
import { I18nProvider } from "@nexus/i18n";
import { ApiRequestError } from "@nexus/services";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MODULES } from "../../app/modules";
import { DashboardsPage } from "./DashboardsPage";

const state = vi.hoisted(() => ({
  online: true,
  permissions: [] as string[],
  entitled: true,
  aiEnabled: true,
  data: undefined as Kpi[] | undefined,
  error: null as Error | null,
  refetch: vi.fn(),
  synced: vi.fn(),
}));

vi.mock("@nexus/services", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nexus/services")>()),
  useDashboardKpis: () => ({
    data: state.data,
    dataUpdatedAt: state.data ? 1000 : 0,
    isError: !!state.error,
    error: state.error,
    refetch: state.refetch,
  }),
  useMe: () => ({ data: { permissions: state.permissions } }),
  useEntitlements: () => ({ data: { items: [{ moduleId: "M11", enabled: state.entitled }] } }),
  useAiSettings: () => ({ data: { enabled: state.aiEnabled } }),
}));
vi.mock("../../app/RouteGuard", () => ({ useOnline: () => state.online }));
vi.mock("../../app/TenantRuntime", () => ({
  useRuntime: () => ({ locale: "en", timeZone: "Asia/Kolkata" }),
}));
vi.mock("../../app/LastSynced", () => ({
  LastSynced: ({ updatedAt }: { updatedAt: number }) => {
    state.synced(updatedAt);
    return null;
  },
}));
vi.mock("../../pages/Forbidden", () => ({ Forbidden: () => <h1>No access</h1> }));
vi.mock("../m11/AssistPanel", () => ({
  AssistPanel: ({ open }: { open: boolean }) => (open ? <div role="dialog" /> : null),
}));

const cached: Kpi = {
  code: "attendance",
  labelKey: "m28.kpi.attendance",
  value: 75,
  unit: "percent",
  currency: null,
  trend: null,
  asOf: "2026-11-25T06:00:00Z",
};

function show() {
  render(
    <I18nProvider locale="en">
      <DashboardsPage />
    </I18nProvider>,
  );
}

beforeEach(() => {
  state.permissions = ["m28.dashboards.read", "m11.assist.use"];
  state.online = true;
  state.entitled = true;
  state.aiEnabled = true;
  state.data = undefined;
  state.error = null;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("Dashboards", () => {
  it("registers the leader card destination with the dashboard permission", async () => {
    const entry = MODULES.find((module) => module.path === "dashboards");
    expect(entry).toMatchObject({
      moduleId: "M28",
      permission: "m28.dashboards.read",
      offlineLevel: "L2",
    });
    expect((await entry?.load())?.default).toBe(DashboardsPage);
  });

  it("shows the loading state until the first response", () => {
    show();
    expect(screen.getByRole("status", { name: "Loading…" })).toBeTruthy();
  });

  it("distinguishes an empty response from a failed request", () => {
    state.data = [];
    show();
    expect(screen.getByText("No metrics are available yet.")).toBeTruthy();
  });

  it("keeps cached metrics and their sync time visible offline after a refresh failure", () => {
    state.online = false;
    state.error = new Error();
    state.data = [cached];
    show();
    expect(screen.getByRole("heading", { name: "Attendance rate" })).toBeTruthy();
    expect(state.synced).toHaveBeenCalledWith(1000);
    expect(screen.queryByRole("button", { name: "Ask Assist" })).toBeNull();
  });

  it.each(["offline", "failed"])("shows recovery when the cache is empty", (reason) => {
    state.online = reason !== "offline";
    state.error = state.online ? new Error() : null;
    show();
    expect(screen.getByText("Dashboards could not be loaded.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });

  it("hides cached metrics when the viewer lacks dashboard access", () => {
    state.permissions = [];
    state.data = [cached];
    show();
    expect(screen.getByRole("heading", { name: "No access" })).toBeTruthy();
    expect(screen.queryByText("Attendance rate")).toBeNull();
  });

  it("discards the cached view when the service denies access", () => {
    state.data = [cached];
    state.error = Object.assign(Object.create(ApiRequestError.prototype) as Error, { status: 403 });
    show();
    expect(screen.getByRole("heading", { name: "No access" })).toBeTruthy();
    expect(screen.queryByText("Attendance rate")).toBeNull();
  });

  it("opens Assist from a loaded dashboard", () => {
    state.data = [cached];
    show();
    fireEvent.click(screen.getByRole("button", { name: "Ask Assist" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it.each(["permission", "entitlement", "settings"])("honours Assist availability", (gate) => {
    state.data = [cached];
    if (gate === "permission") state.permissions = ["m28.dashboards.read"];
    if (gate === "entitlement") state.entitled = false;
    if (gate === "settings") state.aiEnabled = false;
    show();
    expect(screen.queryByRole("button", { name: "Ask Assist" })).toBeNull();
  });
});
