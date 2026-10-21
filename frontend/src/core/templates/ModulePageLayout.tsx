import React from 'react';
import { Shell } from '../../components/layout/Shell';
import { ChevronRight, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

export interface TabItem {
  id: string;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  href?: string;
}

export interface ModulePageLayoutProps {
  moduleId?: string;
  moduleTitle: string;
  portalName?: string;
  description?: string;
  tags?: string[];
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  tabs?: TabItem[];
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
  children: React.ReactNode;
}

export const ModulePageLayout: React.FC<ModulePageLayoutProps> = ({
  moduleId,
  moduleTitle,
  portalName,
  description,
  tags = [],
  breadcrumbs = [],
  actions,
  tabs,
  activeTab,
  onTabChange,
  children
}) => {
  return (
    <Shell>
      <div className="flex flex-col gap-6 max-w-7xl mx-auto w-full">
        {/* Breadcrumb row */}
        <div className="flex items-center gap-2 text-xs text-fg-2">
          <Link to="/dashboard" className="hover:text-fg-0 transition-colors">Home</Link>
          {portalName && (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <span>{portalName}</span>
            </>
          )}
          {moduleId && (
            <>
              <ChevronRight className="w-3.5 h-3.5" />
              <span className="font-mono text-primary font-semibold">{moduleId}</span>
            </>
          )}
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              <ChevronRight className="w-3.5 h-3.5" />
              {b.href ? (
                <Link to={b.href} className="hover:text-fg-0 transition-colors">{b.label}</Link>
              ) : (
                <span className="text-fg-1 font-medium">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Header with Title, Badges & Actions */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-line">
          <div className="flex items-start gap-3">
            {moduleId && (
              <div className="px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20 text-primary font-mono font-bold text-sm shrink-0 mt-1">
                {moduleId}
              </div>
            )}
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-fg-0 tracking-tight">
                  {moduleTitle}
                </h1>
                {tags.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                      >
                        <Sparkles className="w-2.5 h-2.5" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {description && (
                <p className="text-sm text-fg-2 mt-1 max-w-3xl leading-relaxed">
                  {description}
                </p>
              )}
            </div>
          </div>

          {/* Quick Action Button Group */}
          {actions && (
            <div className="flex items-center gap-3 shrink-0 flex-wrap">
              {actions}
            </div>
          )}
        </div>

        {/* Sub-page Navigation Tabs */}
        {tabs && tabs.length > 0 && (
          <div className="flex items-center gap-1 border-b border-line -mt-2 overflow-x-auto scrollbar-none">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id || tab.active;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    if (onTabChange) onTabChange(tab.id);
                    if (tab.onClick) tab.onClick();
                  }}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                    isActive
                      ? 'border-primary text-primary font-semibold'
                      : 'border-transparent text-fg-2 hover:text-fg-0 hover:border-line'
                  }`}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      isActive ? 'bg-primary/20 text-primary' : 'bg-bg-2 text-fg-2'
                    }`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Body Content */}
        <div className="w-full">
          {children}
        </div>
      </div>
    </Shell>
  );
};
