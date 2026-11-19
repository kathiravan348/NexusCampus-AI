import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  CheckboxMatrix,
  type CheckboxMatrixColumn,
  type CheckboxMatrixRow,
} from "./CheckboxMatrix";

const ROWS: CheckboxMatrixRow[] = [
  { id: "read", label: "Read records", group: "Records" },
  { id: "edit", label: "Edit records", group: "Records" },
  { id: "export", label: "Export", group: "Reports" },
];
const COLUMNS: CheckboxMatrixColumn[] = [
  { id: "fixed", label: "Fixed", readOnly: true },
  { id: "custom", label: "Custom" },
];

function setup(onCheckedChange = vi.fn()) {
  const checked = new Set(["read:fixed", "edit:custom"]);
  render(
    <CheckboxMatrix
      caption="Access grid"
      rows={ROWS}
      columns={COLUMNS}
      isChecked={(r, c) => checked.has(`${r}:${c}`)}
      onCheckedChange={onCheckedChange}
    />,
  );
  return { table: screen.getByRole("table", { name: "Access grid" }), onCheckedChange };
}

describe("CheckboxMatrix", () => {
  it("renders group headers, row headers and checked cells", () => {
    const { table } = setup();
    expect(within(table).getByRole("columnheader", { name: "Custom" })).toBeInTheDocument();
    expect(within(table).getByText("Records")).toBeInTheDocument();
    expect(within(table).getByRole("rowheader", { name: /Export/ })).toBeInTheDocument();
    const cell = within(table).getByRole("checkbox", { name: "Edit records — Custom" });
    expect(cell).toHaveAttribute("data-state", "checked");
  });

  it("toggles editable cells and ignores read-only columns", () => {
    const { table, onCheckedChange } = setup();
    fireEvent.click(within(table).getByRole("checkbox", { name: "Read records — Custom" }));
    expect(onCheckedChange).toHaveBeenCalledWith("read", "custom", true);
    fireEvent.click(within(table).getByRole("checkbox", { name: "Edit records — Fixed" }));
    expect(onCheckedChange).toHaveBeenCalledTimes(1);
    expect(within(table).getByRole("checkbox", { name: "Read records — Fixed" })).toHaveAttribute(
      "aria-readonly",
      "true",
    );
  });

  it("moves focus across the grid with arrow keys, Home and End", () => {
    const { table } = setup();
    const first = within(table).getByRole("checkbox", { name: "Read records — Fixed" });
    expect(first).toHaveAttribute("tabindex", "0");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(within(table).getByRole("checkbox", { name: "Read records — Custom" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(within(table).getByRole("checkbox", { name: "Edit records — Custom" })).toHaveFocus();
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(within(table).getByRole("checkbox", { name: "Edit records — Fixed" })).toHaveFocus();
  });

  it("disables every cell in read-only mode", () => {
    const onCheckedChange = vi.fn();
    render(
      <CheckboxMatrix
        caption="Read only"
        readOnly
        rows={ROWS}
        columns={COLUMNS}
        isChecked={() => false}
        onCheckedChange={onCheckedChange}
      />,
    );
    const table = screen.getByRole("table", { name: "Read only" });
    fireEvent.click(within(table).getByRole("checkbox", { name: "Export — Custom" }));
    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
