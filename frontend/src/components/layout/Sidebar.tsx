import React, { useState } from 'react';
import { 
  X, 
  LayoutDashboard, 
  Settings, 
  Search, 
  ChevronDown, 
  ChevronRight, 
  Sparkles,
  Server,
  UserCheck,
  BookOpen,
  Briefcase,
  DollarSign,
  Building2,
  CheckCircle2
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { MODULES_REGISTRY, PORTALS, PortalKey } from '../../modules/registry';
import { useAuth } from '../../core/auth/AuthContext';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCommandPalette?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen, onClose, onOpenCommandPalette }) => {
  const location = useLocation();
  const { user, role, hasAccess } = useAuth();

  // Keep track of which portals are expanded. Expand current active portal by default.
  const [expandedPortals, setExpandedPortals] = useState<Record<PortalKey, boolean>>({
    core: role === 'admin' || role === 'hr',
    lifecycle: true,
    academics: true,
    governance: role === 'admin' || role === 'hr' || role === 'examiner',
    finance: role === 'admin' || role === 'parent',
    operations: true,
  });

  const togglePortal = (portalKey: PortalKey) => {
    setExpandedPortals((prev) => ({
      ...prev,
      [portalKey]: !prev[portalKey]
    }));
  };

  const portalIcons: Record<PortalKey, React.ComponentType<{ className?: string }>> = {
    core: Server,
    lifecycle: UserCheck,
    academics: BookOpen,
    governance: Briefcase,
    finance: DollarSign,
    operations: Building2
  };

  const handleOpenSearch = () => {
    if (onOpenCommandPalette) {
      onOpenCommandPalette();
    } else {
      window.dispatchEvent(new CustomEvent('toggle-command-palette'));
    }
  };

  return (
    <aside 
      className={`
        fixed inset-y-0 left-0 z-30 w-72 bg-bg-1 border-r border-line transform transition-transform duration-300 ease-in-out flex flex-col
        md:translate-x-0 md:static md:inset-auto md:w-72 shrink-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between px-5 border-b border-line shrink-0">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-primary to-secondary flex items-center justify-center text-white shadow-md shadow-primary/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <span className="text-base font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary via-fg-0 to-secondary tracking-tight block leading-tight">
              NexusCampus AI
            </span>
            <span className="text-[10px] text-fg-2 font-mono uppercase tracking-wider block">
              64 Modules ERP
            </span>
          </div>
        </Link>
        <button 
          onClick={onClose}
          className="md:hidden p-1.5 text-fg-2 hover:text-fg-0 hover:bg-bg-2 rounded-lg transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Global Search Button (Cmd+K) */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <button
          type="button"
          onClick={handleOpenSearch}
          className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-fg-2 bg-bg-2 hover:bg-bg-3 border border-line rounded-xl transition-all shadow-sm group"
        >
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
            <span>Search 64 modules...</span>
          </div>
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-bg-1 border border-line rounded text-fg-2">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Navigation list */}
      <nav className="flex-1 overflow-y-auto px-3 py-2 space-y-4 scrollbar-thin">
        {/* Active Role Scope Banner */}
        <div className="p-2.5 rounded-xl bg-bg-2 border border-line-soft mb-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 truncate">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <div className="truncate">
              <span className="text-[10px] text-fg-2 uppercase tracking-wider block">Active Scope</span>
              <span className="font-bold text-fg-0 truncate block">{user?.name || 'Administrator'} ({role})</span>
            </div>
          </div>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono shrink-0 uppercase">
            {role === 'admin' ? 'Super' : role}
          </span>
        </div>

        {/* Core Institutional Links */}
        <div className="space-y-1">
          <Link
            to="/dashboard"
            onClick={onClose}
            className={`
              flex items-center px-3 py-2 rounded-xl text-xs font-semibold transition-all group
              ${location.pathname === '/dashboard'
                ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                : 'text-fg-1 hover:bg-bg-2 hover:text-fg-0 border border-transparent'
              }
            `}
          >
            <LayoutDashboard className={`mr-2.5 h-4 w-4 ${location.pathname === '/dashboard' ? 'text-primary' : 'text-fg-2 group-hover:text-fg-0'}`} />
            <span>Master Dashboard</span>
          </Link>

          {(role === 'admin' || role === 'hr') && (
            <Link
              to="/setup"
              onClick={onClose}
              className={`
                flex items-center px-3 py-2 rounded-xl text-xs font-semibold transition-all group
                ${location.pathname === '/setup'
                  ? 'bg-primary/10 text-primary border border-primary/20 shadow-sm'
                  : 'text-fg-1 hover:bg-bg-2 hover:text-fg-0 border border-transparent'
                }
              `}
            >
              <Settings className={`mr-2.5 h-4 w-4 ${location.pathname === '/setup' ? 'text-primary' : 'text-fg-2 group-hover:text-fg-0'}`} />
              <span>Tenancy & Campus Setup</span>
            </Link>
          )}
        </div>

        {/* 6 Domain Portals Accordions (Filtered by RBAC Role) */}
        <div className="space-y-2 pt-1 border-t border-line">
          <div className="px-2 text-[10px] font-bold text-fg-2 uppercase tracking-wider flex items-center justify-between">
            <span>Enterprise Portals</span>
            <span className="font-mono text-[9px] text-primary">{role === 'admin' ? '64 Modules' : 'Role Filtered'}</span>
          </div>

          {(Object.keys(PORTALS) as PortalKey[])
            .filter(portalKey => hasAccess(portalKey))
            .map((portalKey) => {
              const portal = PORTALS[portalKey];
              const isExpanded = expandedPortals[portalKey];
              const PortalIcon = portalIcons[portalKey];
              const modulesInPortal = MODULES_REGISTRY.filter((m) => m.portal === portalKey && hasAccess(m.route));
              
              if (modulesInPortal.length === 0 && role !== 'admin') return null;

              const liveCount = modulesInPortal.filter(m => m.status === 'implemented').length;

              return (
                <div key={portalKey} className="rounded-xl border border-line/60 overflow-hidden bg-bg-2/30">
                  {/* Accordion Header */}
                  <button
                    onClick={() => togglePortal(portalKey)}
                    className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold text-fg-0 hover:bg-bg-2 transition-colors"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <PortalIcon className="w-3.5 h-3.5 text-primary shrink-0" />
                      <span className="truncate">{portal.name.split('&')[0].trim()}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-bg-3 text-fg-2">
                        {liveCount}/{modulesInPortal.length}
                      </span>
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-fg-2" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-fg-2" />
                      )}
                    </div>
                  </button>

                  {/* Module Items inside Portal */}
                  {isExpanded && (
                    <div className="py-1 px-1.5 space-y-0.5 bg-bg-1 border-t border-line/50">
                      {modulesInPortal.map((mod) => {
                        const isActive = location.pathname.startsWith(mod.route);
                        const isLive = mod.status === 'implemented';

                        return (
                          <Link
                            key={mod.id}
                            to={mod.route}
                            onClick={onClose}
                            className={`
                              flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-all group
                              ${isActive
                                ? 'bg-primary/10 text-primary font-semibold border border-primary/20'
                                : 'text-fg-2 hover:text-fg-0 hover:bg-bg-2 border border-transparent'
                              }
                            `}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="font-mono text-[10px] font-bold text-primary shrink-0">
                                {mod.id}
                              </span>
                              <span className="truncate">{mod.title}</span>
                            </div>

                            {isLive ? (
                              <span className="w-1.5 h-1.5 rounded-full bg-success shrink-0" title="Live Interactive Demo" />
                            ) : (
                              <span className="text-[10px] font-mono text-fg-2/60 shrink-0">·</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      </nav>

      {/* Footer Info Box */}
      <div className="p-3 border-t border-line shrink-0">
        <div className="p-3 bg-bg-2 rounded-xl border border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            <div className="text-[11px] leading-tight">
              <span className="font-semibold text-fg-0 block">64 Modules Ready</span>
              <span className="text-fg-2">13 interactive live routes</span>
            </div>
          </div>
          <kbd 
            onClick={handleOpenSearch}
            className="cursor-pointer px-2 py-1 bg-bg-1 border border-line rounded text-[10px] font-mono text-primary font-bold hover:bg-bg-3 transition-colors"
          >
            ⌘K
          </kbd>
        </div>
      </div>
    </aside>
  );
};
