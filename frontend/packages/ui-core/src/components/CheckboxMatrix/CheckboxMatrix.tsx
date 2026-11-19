import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "../../lib/cn";

export interface CheckboxMatrixRow {
  id: string;
  /** Plain text: also used in each cell's accessible name. */
  label: string;
  description?: React.ReactNode;
  /** Extra marker after the label, e.g. a "sensitive" badge. */
  badge?: React.ReactNode;
  /** Rows with the same group are shown under one group header, in first-seen order. */
  group?: string;
}

export interface CheckboxMatrixColumn {
  id: string;
  label: string;
  readOnly?: boolean;
}

export interface CheckboxMatrixProps {
  rows: CheckboxMatrixRow[];
  columns: CheckboxMatrixColumn[];
  isChecked: (rowId: string, columnId: string) => boolean;
  onCheckedChange?: (rowId: string, columnId: string, checked: boolean) => void;
  /** Accessible name of the grid (table caption). */
  caption: string;
  /** Every cell read-only. */
  readOnly?: boolean;
  className?: string;
}

const KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);

interface Cell {
  row: number;
  col: number;
}

function grouped(rows: CheckboxMatrixRow[]): { group: string | null; rows: CheckboxMatrixRow[] }[] {
  const out: { group: string | null; rows: CheckboxMatrixRow[] }[] = [];
  for (const row of rows) {
    const group = row.group ?? null;
    const last = out.find((g) => g.group === group);
    if (last) last.rows.push(row);
    else out.push({ group, rows: [row] });
  }
  return out;
}

/**
 * Rows × columns of checkboxes (e.g. permissions × roles) with group headers, read-only columns,
 * arrow-key grid navigation (RTL aware) and a card list below `md`.
 */
export function CheckboxMatrix({
  rows,
  columns,
  isChecked,
  onCheckedChange,
  caption,
  readOnly = false,
  className,
}: CheckboxMatrixProps): React.ReactElement {
  const gridRef = React.useRef<HTMLTableElement>(null);
  const groups = grouped(rows);
  const ordered = groups.flatMap((g) => g.rows);
  const [active, setActive] = React.useState<Cell>({ row: 0, col: 0 });

  const focusCell = (cell: Cell) => {
    const row = Math.max(0, Math.min(ordered.length - 1, cell.row));
    const col = Math.max(0, Math.min(columns.length - 1, cell.col));
    setActive({ row, col });
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-cell="${row}:${col}"]`)?.focus();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, cell: Cell) => {
    if (!KEYS.has(event.key)) return;
    event.preventDefault();
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const step = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1 } as Record<string, number>;
    if (event.key === "ArrowUp") focusCell({ ...cell, row: cell.row - 1 });
    else if (event.key === "ArrowDown") focusCell({ ...cell, row: cell.row + 1 });
    else if (event.key === "Home") focusCell({ ...cell, col: 0 });
    else if (event.key === "End") focusCell({ ...cell, col: columns.length - 1 });
    else focusCell({ ...cell, col: cell.col + (step[event.key] ?? 0) });
  };

  const box = (row: CheckboxMatrixRow, column: CheckboxMatrixColumn, cell: Cell | null) => {
    const locked = readOnly || Boolean(column.readOnly);
    const checked = isChecked(row.id, column.id);
    return (
      <CheckboxPrimitive.Root
        checked={checked}
        aria-label={`${row.label} — ${column.label}`}
        aria-readonly={locked || undefined}
        tabIndex={cell && (cell.row !== active.row || cell.col !== active.col) ? -1 : 0}
        {...(cell ? { "data-cell": `${cell.row}:${cell.col}` } : {})}
        onKeyDown={cell ? (e) => onKeyDown(e, cell) : undefined}
        onFocus={cell ? () => setActive(cell) : undefined}
        onCheckedChange={(next) => {
          if (!locked) onCheckedChange?.(row.id, column.id, next === true);
        }}
        className={cn(
          "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-xs border transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface",
          "data-[state=checked]:border-brand-primary data-[state=checked]:bg-brand-primary data-[state=checked]:text-on-brand",
          locked
            ? "cursor-default border-border-default opacity-70"
            : "cursor-pointer border-border-strong bg-bg-surface",
        )}
      >
        <CheckboxPrimitive.Indicator aria-hidden="true">
          <Check className="h-3.5 w-3.5 stroke-[3]" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  };

  const rowLabel = (row: CheckboxMatrixRow) => (
    <span className="flex flex-col gap-0.5">
      <span className="flex flex-wrap items-center gap-2 text-body text-text-primary">
        {row.label}
        {row.badge}
      </span>
      {row.description && <span className="text-body-sm text-text-muted">{row.description}</span>}
    </span>
  );

  let index = -1;
  return (
    <div className={className}>
      <div className="hidden overflow-x-auto rounded-lg border border-border-default bg-bg-surface md:block">
        <table ref={gridRef} className="w-full border-collapse text-start">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-bg-raised">
            <tr>
              <th scope="col" className="px-4 py-3 text-start">
                <span className="sr-only">{caption}</span>
              </th>
              {columns.map((c) => (
                <th
                  key={c.id}
                  scope="col"
                  className="px-3 py-3 text-center text-label uppercase text-text-muted"
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <React.Fragment key={g.group ?? "_"}>
                {g.group && (
                  <tr className="border-t border-border-default bg-bg-raised/60">
                    <th
                      scope="colgroup"
                      colSpan={columns.length + 1}
                      className="px-4 py-2 text-start text-label uppercase text-text-secondary"
                    >
                      {g.group}
                    </th>
                  </tr>
                )}
                {g.rows.map((row) => {
                  index += 1;
                  const r = index;
                  return (
                    <tr key={row.id} className="border-t border-border-default">
                      <th scope="row" className="px-4 py-3 text-start font-normal">
                        {rowLabel(row)}
                      </th>
                      {columns.map((c, col) => (
                        <td key={c.id} className="px-3 py-3 text-center">
                          {box(row, c, { row: r, col })}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {groups.map((g) => (
          <section key={g.group ?? "_"} className="space-y-2">
            {g.group && <h3 className="text-label uppercase text-text-secondary">{g.group}</h3>}
            {g.rows.map((row) => (
              <div
                key={row.id}
                className="space-y-2 rounded-lg border border-border-default bg-bg-surface p-4"
              >
                {rowLabel(row)}
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {columns.map((c) => (
                    <label
                      key={c.id}
                      className="flex items-center gap-2 text-body-sm text-text-secondary"
                    >
                      {box(row, c, null)}
                      {c.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
