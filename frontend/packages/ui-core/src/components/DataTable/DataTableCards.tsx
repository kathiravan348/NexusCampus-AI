import * as React from "react";
import { flexRender, type Table } from "@tanstack/react-table";
import { useText } from "@nexus/i18n";
import { cn } from "../../lib/cn";
import { Skeleton } from "../Skeleton/Skeleton";
import "./columnMeta";

export interface DataTableCardsProps<TData> {
  table: Table<TData>;
  caption: string;
  loading?: boolean;
  error?: React.ReactNode;
  emptyState?: React.ReactNode;
}

export function DataTableCards<TData>({
  table,
  caption,
  loading = false,
  error,
  emptyState,
}: DataTableCardsProps<TData>): React.ReactElement {
  const t = useText();

  if (loading) {
    return (
      <ul aria-label={caption} aria-busy="true" className="space-y-3">
        {[0, 1, 2].map((index) => (
          <li
            key={index}
            className="rounded-lg border border-border-default bg-bg-surface p-4 space-y-3"
          >
            <Skeleton className="h-5 w-1/3" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-border-default bg-bg-surface p-6 text-center text-body text-danger-text"
      >
        {error}
      </div>
    );
  }

  const rows = table.getRowModel().rows;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-border-default bg-bg-surface p-8 text-center text-body text-text-muted">
        {emptyState ?? t("common.empty")}
      </div>
    );
  }

  return (
    <ul aria-label={caption} className="space-y-3">
      {rows.map((row) => {
        const cells = row.getVisibleCells();
        const primaryCell =
          cells.find((cell) => cell.column.columnDef.meta?.primary) ??
          cells.find((cell) => !cell.column.columnDef.meta?.hideOnMobile);

        const detailCells = cells.filter(
          (cell) => cell !== primaryCell && !cell.column.columnDef.meta?.hideOnMobile,
        );

        return (
          <li key={row.id} className="rounded-lg border border-border-default bg-bg-surface p-4">
            {primaryCell && (
              <div className="font-sans text-body font-semibold text-text-primary break-words">
                {flexRender(primaryCell.column.columnDef.cell, primaryCell.getContext())}
              </div>
            )}
            {detailCells.length > 0 && (
              <dl className="mt-3 space-y-2 text-body-sm">
                {detailCells.map((cell) => {
                  const meta = cell.column.columnDef.meta;
                  const header = cell.column.columnDef.header;
                  const label =
                    meta?.mobileLabel ?? (typeof header === "string" ? header : cell.column.id);

                  return (
                    <div key={cell.id} className="flex items-center justify-between gap-2">
                      <dt className="text-text-muted shrink-0">{label}</dt>
                      <dd
                        className={cn(
                          "text-text-primary text-end min-w-0 break-words",
                          meta?.numeric && "whitespace-nowrap font-mono text-number",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </li>
        );
      })}
    </ul>
  );
}
