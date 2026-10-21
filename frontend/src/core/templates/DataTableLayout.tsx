import React from 'react';
import { Search, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DataTableLayoutProps {
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  totalRecords?: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  children: React.ReactNode;
}

export const DataTableLayout: React.FC<DataTableLayoutProps> = ({
  searchQuery,
  onSearchChange,
  searchPlaceholder = 'Search records...',
  filters,
  actions,
  totalRecords = 0,
  currentPage = 1,
  pageSize = 10,
  onPageChange,
  children
}) => {
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return (
    <div className="bg-bg-1 border border-line rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-line flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-bg-2/30">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          {onSearchChange && (
            <div className="relative w-full">
              <Search className="w-4 h-4 text-fg-2 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery || ''}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder={searchPlaceholder}
                className="w-full bg-bg-1 border border-line rounded-xl pl-9 pr-4 py-2 text-sm text-fg-0 placeholder:text-fg-2 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all"
              />
            </div>
          )}
          {filters}
        </div>

        {actions && (
          <div className="flex items-center gap-2 self-end md:self-auto">
            {actions}
          </div>
        )}
      </div>

      {/* Table Body */}
      <div className="overflow-x-auto">
        {children}
      </div>

      {/* Pagination Footer */}
      {totalRecords > 0 && (
        <div className="p-4 border-t border-line bg-bg-2/20 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-fg-2">
          <div>
            Showing <span className="font-semibold text-fg-0">{(currentPage - 1) * pageSize + 1}</span> to{' '}
            <span className="font-semibold text-fg-0">{Math.min(currentPage * pageSize, totalRecords)}</span> of{' '}
            <span className="font-semibold text-fg-0">{totalRecords}</span> entries
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange && onPageChange(currentPage - 1)}
              disabled={currentPage <= 1}
              className="p-1.5 rounded-lg border border-line bg-bg-1 hover:bg-bg-2 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-medium text-fg-1">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => onPageChange && onPageChange(currentPage + 1)}
              disabled={currentPage >= totalPages}
              className="p-1.5 rounded-lg border border-line bg-bg-1 hover:bg-bg-2 disabled:opacity-40 disabled:pointer-events-none transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
