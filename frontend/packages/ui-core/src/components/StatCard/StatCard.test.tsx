import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatCard } from "./StatCard";

describe("StatCard", () => {
  it("renders label, value, and caption with contrast-safe tone classes", () => {
    render(<StatCard label="Learners" value="1,240" caption="Active" captionTone="positive" />);
    expect(screen.getByText("Learners")).toBeInTheDocument();
    expect(screen.getByText("1,240")).toBeInTheDocument();
    expect(screen.getByText("Active")).toHaveClass("text-success-text");
  });

  it("renders skeleton placeholders while loading", () => {
    render(<StatCard label="Learners" value="1,240" caption="Active" loading />);
    expect(screen.queryByText("1,240")).not.toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton")).toHaveLength(3);
  });
});
