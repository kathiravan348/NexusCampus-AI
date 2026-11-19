import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Tabs } from "./Tabs";

const items = [
  { value: "one", label: "First", content: <p>First panel</p> },
  { value: "two", label: "Second", content: <p>Second panel</p> },
  { value: "three", label: "Third", content: <p>Third panel</p>, disabled: true },
];

describe("Tabs", () => {
  it("renders accessible tablist and shows the first panel by default", () => {
    render(<Tabs items={items} ariaLabel="Sections" />);

    expect(screen.getByRole("tablist", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "First" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("First panel")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Third" })).toBeDisabled();
  });

  it("supports controlled value changes", () => {
    const onValueChange = vi.fn();
    render(<Tabs items={items} value="one" onValueChange={onValueChange} ariaLabel="Sections" />);

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Second" }));
    expect(onValueChange).toHaveBeenCalledWith("two");
  });
});
