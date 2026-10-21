import React from 'react';
import { Shell } from '../../components/layout/Shell';

export const PageLoadingSkeleton: React.FC = () => {
  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full animate-pulse">
        {/* Breadcrumb skeleton */}
        <div className="h-4 w-48 bg-bg-2 rounded-md" />

        {/* Header skeleton */}
        <div className="flex items-center justify-between pb-4 border-b border-line">
          <div className="space-y-2">
            <div className="h-8 w-64 bg-bg-2 rounded-lg" />
            <div className="h-4 w-96 bg-bg-2 rounded-md" />
          </div>
          <div className="flex gap-3">
            <div className="h-9 w-24 bg-bg-2 rounded-xl" />
            <div className="h-9 w-32 bg-bg-2 rounded-xl" />
          </div>
        </div>

        {/* Content grid skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-32 bg-bg-2 rounded-2xl border border-line" />
          <div className="h-32 bg-bg-2 rounded-2xl border border-line" />
          <div className="h-32 bg-bg-2 rounded-2xl border border-line" />
        </div>

        {/* Large body card skeleton */}
        <div className="h-96 bg-bg-2 rounded-2xl border border-line" />
      </div>
    </Shell>
  );
};
