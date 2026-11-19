import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useText } from "@nexus/i18n";
import { cn } from "../../lib/cn";
import { Skeleton } from "../Skeleton/Skeleton";
import { DataTableCards } from "./DataTableCards";
import { DataTablePagination, type DataTablePaginationState } from "./DataTablePagination";
import "./columnMeta";

export interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  caption: string;
  getRowId?: (row: TData) => string;
  initialSort?: SortingState;
  /** Client-side page size (ignored when controlled `pagination` is provided). */
  pageSize?: number;
  /** Controlled 1-based offset pagination (`{ page, pageSize, total }` per D15). */
  pagination?: DataTablePaginationState;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizes?: number[];
  loading?: boolean;
  error?: React.ReactNode;
  emptyState?: React.ReactNode;
  className?: string;
}

export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  caption,
  getRowId,
  initialSort,
  pageSize,
  pagination: controlledPagination,
  onPageChange,
  onPageSizeChange,
  pageSizes,
  loading = false,
  error,
  emptyState,
  className,
}: DataTableProps<TData, TValue>): React.ReactElement {
  const t = useText();
  const isControlledPagination = controlledPagination !== undefined;
  const [sorting, setSorting] = React.useState<SortingState>(initialSort ?? []);
  const [localPagination, setLocalPagination] = React.useState({
    pageIndex: 0,
    pageSize: pageSize ?? 10,
  });

  React.useEffect(() => {
    setLocalPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [data, pageSize]);

  React.useEffect(() => {
    if (pageSize !== undefined) {
      setLocalPagination((current) => ({ ...current, pageSize }));
    }
  }, [pageSize]);

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      pagination: isControlledPagination
        ? {
            pageIndex: Math.max(0, controlledPagination.page - 1),
            pageSize: controlledPagination.pageSize,
          }
        : localPagination,
    },
    onSortingChange: (updater) => {
      setSorting(updater);
      if (!isControlledPagination) {
        setLocalPagination((current) => ({ ...current, pageIndex: 0 }));
      }
    },
    onPaginationChange: isControlledPagination ? undefined : setLocalPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel:
      !isControlledPagination && pageSize !== undefined ? getPaginationRowModel() : undefined,
    manualPagination: isControlledPagination || pageSize === undefined,
    pageCount: isControlledPagination
      ? Math.max(
          1,
          Math.ceil(controlledPagination.total / Math.max(1, controlledPagination.pageSize)),
        )
      : undefined,
    getRowId,
    autoResetPageIndex: false,
  });

  const visibleRows = table.getRowModel().rows;
  const showControlledPager = isControlledPagination && onPageChange !== undefined;
  const showLocalPager = !isControlledPagination && pageSize !== undefined;
  const activePager: DataTablePaginationState | null = showControlledPager
    ? controlledPagination
    : showLocalPager
      ? {
          page: localPagination.pageIndex + 1,
          pageSize: localPagination.pageSize,
          total: data.length,
        }
      : null;

  return (
    <div className={cn("w-full space-y-4", className)}>
      <div className="hidden md:block overflow-x-auto rounded-lg border border-border-default bg-bg-surface">
        <table className="w-full text-start border-collapse" aria-busy={loading || undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-bg-raised text-label uppercase text-text-muted border-b border-border-default rtl:tracking-normal">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const isNumeric = header.column.columnDef.meta?.numeric ?? false;
                  const canSort = header.column.getCanSort();
                  const isSorted = header.column.getIsSorted();
                  const ariaSort =
                    isSorted === "asc"
                      ? "ascending"
                      : isSorted === "desc"
                        ? "descending"
                        : canSort
                          ? "none"
                          : undefined;

                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={ariaSort}
                      className={cn(
                        "px-5 py-3 font-semibold",
                        isNumeric ? "text-end" : "text-start",
                      )}
                    >
                      {header.isPlaceholder ? null : canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-xs transition-colors hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary cursor-pointer",
                            isNumeric && "flex-row-reverse",
                          )}
                        >
                          <span>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                          {isSorted === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          ) : isSorted === "desc" ? (
                            <ArrowDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                          ) : (
                            <ArrowUpDown
                              className="h-3.5 w-3.5 shrink-0 opacity-50"
                              aria-hidden="true"
                            />
                          )}
                        </button>
                      ) : (
                        <span>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody className="divide-y divide-border-default">
            {loading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <tr key={rowIndex}>
                  {columns.map((_, colIndex) => (
                    <td key={colIndex} className="px-5 py-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={columns.length} className="px-5 py-8 text-center">
                  <div role="alert" className="text-body text-danger-text">
                    {error}
                  </div>
                </td>
              </tr>
            ) : visibleRows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-5 py-8 text-center text-body text-text-muted"
                >
                  {emptyState ?? t("common.empty")}
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr key={row.id} className="transition-colors hover:bg-bg-raised/60">
                  {row.getVisibleCells().map((cell) => {
                    const isNumeric = cell.column.columnDef.meta?.numeric ?? false;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          "px-5 py-3 text-body text-text-primary",
                          isNumeric
                            ? "whitespace-nowrap font-mono text-number text-end"
                            : "text-start",
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="md:hidden">
        <DataTableCards
          table={table}
          caption={caption}
          loading={loading}
          error={error}
          emptyState={emptyState}
        />
      </div>

      {!loading && !error && activePager && (
        <DataTablePagination
          page={activePager.page}
          pageSize={activePager.pageSize}
          total={activePager.total}
          pageSizes={pageSizes ?? (pageSize !== undefined ? [pageSize, 25, 50, 100] : undefined)}
          onPageChange={
            showControlledPager
              ? onPageChange
              : (nextPage) =>
                  setLocalPagination((current) => ({ ...current, pageIndex: nextPage - 1 }))
          }
          onPageSizeChange={
            showControlledPager
              ? onPageSizeChange
              : (nextSize) => setLocalPagination({ pageIndex: 0, pageSize: nextSize })
          }
        />
      )}
    </div>
  );
}
