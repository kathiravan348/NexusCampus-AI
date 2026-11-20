import * as React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ColumnDef } from "@tanstack/react-table";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@nexus/i18n";
import { DataTable } from "./DataTable";

interface LearnerRow {
  id: string;
  name: string;
  code: string;
  score: number;
  notes: string;
}

const columns: ColumnDef<LearnerRow>[] = [
  {
    accessorKey: "name",
    header: "Name",
    meta: { primary: true },
  },
  {
    accessorKey: "code",
    header: "Code",
    meta: { mobileLabel: "ID Code" },
  },
  {
    accessorKey: "score",
    header: "Score",
    meta: { numeric: true },
  },
  {
    accessorKey: "notes",
    header: "Notes",
    meta: { hideOnMobile: true },
  },
];

const rows: LearnerRow[] = [
  { id: "1", name: "Amina", code: "L-01", score: 92, notes: "Hidden on mobile" },
  { id: "2", name: "Bilal", code: "L-02", score: 85, notes: "Second note" },
  { id: "3", name: "Chandra", code: "L-03", score: 97, notes: "Third note" },
];

function renderWithI18n(ui: React.ReactElement, locale = "en") {
  return render(<I18nProvider locale={locale}>{ui}</I18nProvider>);
}

describe("DataTable", () => {
  it("renders desktop table and mobile cards with column metadata", () => {
    renderWithI18n(
      <DataTable columns={columns} data={rows} caption="Learners" getRowId={(r) => r.id} />,
    );

    const table = screen.getByRole("table", { name: "Learners" });
    expect(within(table).getByText("Amina")).toBeInTheDocument();
    expect(within(table).getByText("Hidden on mobile")).toBeInTheDocument();

    const list = screen.getByRole("list", { name: "Learners" });
    expect(within(list).getByText("Amina")).toBeInTheDocument();
    expect(within(list).getAllByText("ID Code")).toHaveLength(3);
    expect(within(list).queryByText("Hidden on mobile")).not.toBeInTheDocument();
  });

  it("sorts columns and updates aria-sort", () => {
    renderWithI18n(<DataTable columns={columns} data={rows} caption="Learners" />);

    const nameHeader = screen.getByRole("columnheader", { name: "Name" });
    expect(nameHeader).toHaveAttribute("aria-sort", "none");

    fireEvent.click(within(nameHeader).getByRole("button", { name: "Name" }));
    expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

    fireEvent.click(within(nameHeader).getByRole("button", { name: "Name" }));
    expect(nameHeader).toHaveAttribute("aria-sort", "descending");
  });

  it("supports controlled offset pagination per D15", () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();

    renderWithI18n(
      <DataTable
        columns={columns}
        data={rows.slice(0, 2)}
        caption="Learners"
        pagination={{ page: 1, pageSize: 2, total: 5 }}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizes={[2, 10]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Pagination" });
    expect(nav).toHaveTextContent("Showing 1–2 of 5");
    expect(nav).toHaveTextContent("Page 1 of 3");

    expect(within(nav).getByRole("button", { name: "First page" })).toBeDisabled();
    expect(within(nav).getByRole("button", { name: "Previous page" })).toBeDisabled();

    fireEvent.click(within(nav).getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(2);

    fireEvent.click(within(nav).getByRole("button", { name: "Last page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    fireEvent.change(within(nav).getByLabelText("Rows per page"), { target: { value: "10" } });
    expect(onPageSizeChange).toHaveBeenCalledWith(10);
    expect(onPageChange).toHaveBeenCalledWith(1);
  });

  it("supports uncontrolled client-side pagination with pageSize", () => {
    renderWithI18n(<DataTable columns={columns} data={rows} caption="Learners" pageSize={2} />);

    const table = screen.getByRole("table", { name: "Learners" });
    expect(within(table).getByText("Amina")).toBeInTheDocument();
    expect(within(table).queryByText("Chandra")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(within(table).getByText("Chandra")).toBeInTheDocument();
  });

  it("renders loading, error, and localized empty states", () => {
    const { rerender } = renderWithI18n(
      <DataTable columns={columns} data={[]} caption="Learners" loading />,
    );
    expect(screen.getByRole("table", { name: "Learners" })).toHaveAttribute("aria-busy", "true");

    rerender(
      <I18nProvider locale="en">
        <DataTable columns={columns} data={[]} caption="Learners" error="Failed to load" />
      </I18nProvider>,
    );
    expect(screen.getAllByRole("alert")[0]).toHaveTextContent("Failed to load");

    rerender(
      <I18nProvider locale="ta">
        <DataTable columns={columns} data={[]} caption="Learners" />
      </I18nProvider>,
    );
    expect(screen.getAllByText("இங்கே இன்னும் எதுவும் இல்லை")).toHaveLength(2);
  });
});
