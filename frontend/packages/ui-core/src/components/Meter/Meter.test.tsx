import * as React from "react";
import { I18nProvider } from "@nexus/i18n";
import { render as rtlRender, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Meter, meterTone } from "./Meter";

const render = (ui: React.ReactElement) => rtlRender(<I18nProvider locale="en">{ui}</I18nProvider>);

describe("Meter", () => {
  it("exposes an accessible meter with value text and a danger tone at 95 %", () => {
    render(
      <Meter
        label="AI credits"
        value={950}
        max={1000}
        valueText="950 of 1,000"
        thresholds={{ warning: 0.8, danger: 0.95 }}
      />,
    );
    const meter = screen.getByRole("meter", { name: "AI credits" });
    expect(meter).toHaveAttribute("aria-valuenow", "950");
    expect(meter).toHaveAttribute("aria-valuemax", "1000");
    expect(meter).toHaveAttribute("aria-valuetext", "950 of 1,000");
    expect(meter).toHaveAttribute("data-tone", "danger");
  });

  it("picks tones from the default thresholds", () => {
    expect(meterTone(50, 100)).toBe("normal");
    expect(meterTone(80, 100)).toBe("warning");
    expect(meterTone(100, 100)).toBe("danger");
    expect(meterTone(130, 100)).toBe("danger");
    expect(meterTone(1, 0)).toBe("danger");
  });

  it("caps the fill and value at the maximum", () => {
    render(<Meter label="Learners" value={120} max={100} valueText="120 of 100" />);
    const meter = screen.getByRole("meter", { name: "Learners" });
    expect(meter).toHaveAttribute("aria-valuenow", "100");
    expect(meter.firstElementChild).toHaveStyle({ width: "100%" });
  });

  it("shows the unlimited state without a meter role", () => {
    render(<Meter label="Staff" value={12} max={null} valueText="12" />);
    expect(screen.queryByRole("meter")).not.toBeInTheDocument();
    expect(screen.getByText("12 · Unlimited")).toBeInTheDocument();
  });

  it("renders skeletons while loading", () => {
    render(<Meter label="Storage" value={0} max={10} valueText="0" loading />);
    expect(screen.getAllByTestId("skeleton")).toHaveLength(2);
  });
});
