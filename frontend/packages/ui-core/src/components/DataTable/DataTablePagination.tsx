import * as React from "react";
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from "lucide-react";
import { useText } from "@nexus/i18n";
import { IconButton } from "../IconButton/IconButton";
import { Select } from "../Select/Select";

export interface DataTablePaginationState {
  /** Current 1-based page number (D15). */
  page: number;
  pageSize: number;
  total: number;
}

export interface DataTablePaginationProps extends DataTablePaginationState {
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizes?: number[];
  loading?: boolean;
}

export function DataTablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [10, 25, 50, 100],
  loading = false,
}: DataTablePaginationProps): React.ReactElement | null {
  const t = useText();

  if (total === 0) {
    return null;
  }

  const safePageSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const currentPage = Math.max(1, Math.min(page, pageCount));
  const start = (currentPage - 1) * safePageSize + 1;
  const end = Math.min(currentPage * safePageSize, total);
  const sizes = [...new Set([...pageSizes, safePageSize])].sort((a, b) => a - b);

  return (
    <nav
      aria-label={t("common.pagination")}
      aria-busy={loading}
      className="flex flex-col gap-3 py-2 md:flex-row md:items-center md:justify-between"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 md:contents">
        <div className="min-w-0 text-body-sm text-text-muted" role="status">
          <p className="font-mono">{t("common.paginationRange", { start, end, total })}</p>
          <p className="font-mono">
            {t("common.paginationPageOf", { page: currentPage, pageCount })}
          </p>
        </div>

        {onPageSizeChange && (
          <Select
            label={t("common.rowsPerPage")}
            containerClassName="shrink-0 min-w-36"
            className="font-mono"
            value={String(safePageSize)}
            options={sizes.map((size) => ({
              value: String(size),
              label: t("common.pageSizeOption", { count: size }),
            }))}
            disabled={loading}
            onChange={(event) => {
              onPageSizeChange(Number(event.target.value));
              onPageChange(1);
            }}
          />
        )}
      </div>

      <div className="flex items-center justify-between gap-2 md:justify-end">
        <IconButton
          aria-label={t("common.firstPage")}
          icon={<ChevronFirst className="h-4 w-4 rtl:rotate-180" />}
          variant="secondary"
          size="sm"
          disabled={loading || currentPage <= 1}
          onClick={() => onPageChange(1)}
        />
        <IconButton
          aria-label={t("common.previousPage")}
          icon={<ChevronLeft className="h-4 w-4 rtl:rotate-180" />}
          variant="secondary"
          size="sm"
          disabled={loading || currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        />
        <IconButton
          aria-label={t("common.nextPage")}
          icon={<ChevronRight className="h-4 w-4 rtl:rotate-180" />}
          variant="secondary"
          size="sm"
          disabled={loading || currentPage >= pageCount}
          onClick={() => onPageChange(currentPage + 1)}
        />
        <IconButton
          aria-label={t("common.lastPage")}
          icon={<ChevronLast className="h-4 w-4 rtl:rotate-180" />}
          variant="secondary"
          size="sm"
          disabled={loading || currentPage >= pageCount}
          onClick={() => onPageChange(pageCount)}
        />
      </div>
    </nav>
  );
}
