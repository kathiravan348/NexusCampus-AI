import { createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Select } from "./Select";

describe("Select", () => {
  it("renders grouped options, placeholder, and handles selection changes", () => {
    const ref = createRef<HTMLSelectElement>();
    const onChange = vi.fn();
    render(
      <Select
        ref={ref}
        label="Status"
        placeholder="Select an option"
        options={[
          { value: "active", label: "Active", group: "Open" },
          { value: "pending", label: "Pending", group: "Open" },
          { value: "inactive", label: "Inactive" },
        ]}
        onChange={onChange}
      />,
    );
    const select = screen.getByLabelText("Status");
    expect(ref.current).toBe(select);
    expect(select).toHaveClass("ps-3", "pe-10");
    expect(select.querySelectorAll("optgroup")).toHaveLength(1);
    fireEvent.change(select, { target: { value: "active" } });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("wires error state to aria-invalid and aria-describedby", () => {
    render(
      <Select label="Status" error="Required" options={[{ value: "active", label: "Active" }]} />,
    );
    const select = screen.getByLabelText("Status");
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAttribute("aria-describedby", `${select.id}-error`);
  });
});
