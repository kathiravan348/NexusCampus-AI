import type { Kpi } from "@nexus/contracts";
import {
  formatDateTime,
  formatMoney,
  formatNumber,
  I18nProvider,
  SOURCE_LOCALE,
} from "@nexus/i18n";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KpiTile } from "./KpiTile";

const runtime = vi.hoisted(() => ({ locale: "en", timeZone: "Asia/Kolkata" }));
vi.mock("../../app/TenantRuntime", () => ({ useRuntime: () => runtime }));

const metric: Kpi = {
  code: "learners",
  labelKey: "m28.kpi.learners",
  value: 1250,
  unit: "count",
  currency: null,
  trend: null,
  asOf: "2026-11-24T23:45:00Z",
};

function show(overrides: Partial<Kpi> = {}) {
  return render(
    <I18nProvider locale={runtime.locale}>
      <ul>
        <KpiTile kpi={{ ...metric, ...overrides }} />
      </ul>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  runtime.locale = "en";
  runtime.timeZone = "Asia/Kolkata";
});

describe("KPI tile", () => {
  it("labels the count and dates it in the institution time zone", () => {
    show();
    expect(screen.getByRole("heading", { name: "Active learners" })).toBeTruthy();
    expect(screen.getByText(formatNumber(metric.value, runtime.locale))).toBeTruthy();
    const time = formatDateTime(metric.asOf, runtime);
    expect(screen.getByText(`As of ${time}`).getAttribute("datetime")).toBe(metric.asOf);
    expect(screen.queryByText(/Increasing|Decreasing|No change/)).toBeNull();
  });

  it("formats percentages on their original scale", () => {
    show({ unit: "percent", value: 82.5 });
    expect(screen.getByText("82.5%")).toBeTruthy();
  });

  it.each(["INR", "JPY"])("uses the supplied currency’s minor unit precision", (currency) => {
    show({ unit: "minor_units", currency });
    expect(screen.getByText(formatMoney(metric.value, currency, runtime.locale))).toBeTruthy();
  });

  it.each([
    [1, "1 day"],
    [3, "3 days"],
  ] as const)("inflects a duration", (value, label) => {
    show({ unit: "days", value });
    expect(screen.getByText(label)).toBeTruthy();
  });

  it.each([
    ["up", "Increasing"],
    ["down", "Decreasing"],
    ["flat", "No change"],
  ] as const)("pairs trend text with a decorative icon", (trend, label) => {
    show({ trend });
    expect(screen.getByText(label).querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("replaces an unfamiliar label with a translated heading", () => {
    show({ labelKey: "m28.kpi.unrecognised" });
    expect(screen.getByRole("heading", { name: "Institution metric" })).toBeTruthy();
    expect(screen.queryByText("m28.kpi.unrecognised")).toBeNull();
  });

  it("uses source number formatting in the pseudo-locale", () => {
    runtime.locale = "en-XA";
    show();
    expect(screen.getByText(formatNumber(metric.value, SOURCE_LOCALE))).toBeTruthy();
  });
});
