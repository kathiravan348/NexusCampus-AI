import { useState, useEffect, useRef } from 'react';
import { Menu, Search, Sun, Moon, Sparkles, Database, ChevronDown, Check, Plus, RefreshCw, ShieldCheck, LogOut } from 'lucide-react';
import { useTheme } from '../../theme/ThemeProvider';
import { getActiveTenant, setActiveTenant, apiClient, ActiveTenant } from '../../api/client';
import { useAuth, DEMO_PERSONAS, UserRole } from '../../core/auth/AuthContext';

interface TopbarProps {
  onMenuToggle: () => void;
  onOpenCommandPalette?: () => void;
}

export function Topbar({ onMenuToggle, onOpenCommandPalette }: TopbarProps) {
  const { theme, toggleTheme } = useTheme();
  const { user, role, logout, quickLogin } = useAuth();
  const [activeTenant, setActiveTenantState] = useState<ActiveTenant>(getActiveTenant());
  const [tenantsList, setTenantsList] = useState<any[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const roleBadgeColors: Record<UserRole, string> = {
    admin: 'bg-indigo-500/20 text-indigo-500 border border-indigo-500/30',
    student: 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30',
    teacher: 'bg-blue-500/20 text-blue-500 border border-blue-500/30',
    hr: 'bg-purple-500/20 text-purple-500 border border-purple-500/30',
    placement: 'bg-amber-500/20 text-amber-500 border border-amber-500/30',
    examiner: 'bg-rose-500/20 text-rose-500 border border-rose-500/30',
    parent: 'bg-teal-500/20 text-teal-500 border border-teal-500/30'
  };

  // Sync active tenant on events
  useEffect(() => {
    const handleTenantChanged = (e: any) => {
      if (e.detail) {
        setActiveTenantState(e.detail);
      }
    };
    window.addEventListener('nexus-tenant-changed', handleTenantChanged);
    return () => window.removeEventListener('nexus-tenant-changed', handleTenantChanged);
  }, []);

  // Fetch registered tenants from backend
  useEffect(() => {
    let mounted = true;
    apiClient.listTenants()
      .then((tenants) => {
        if (mounted && Array.isArray(tenants)) {
          setTenantsList(tenants);
        }
      })
      .catch(() => {
        // Fallback list
        if (mounted) {
          setTenantsList([
            { id: 1, name: 'NexusCampus Master Demo Template', slug: 'default', db_name: 'nexus_default_demo' }
          ]);
        }
      });
    return () => { mounted = false; };
  }, [dropdownOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenSearch = () => {
    if (onOpenCommandPalette) {
      onOpenCommandPalette();
    } else {
      window.dispatchEvent(new CustomEvent('toggle-command-palette'));
    }
  };

  const handleSelectTenant = (t: any) => {
    const isTemplate = t.slug === 'default' || t.db_name === 'nexus_default_demo';
    const newTenant: ActiveTenant = {
      slug: t.slug,
      name: t.name,
      db_name: t.db_name,
      isTemplate
    };
    setActiveTenant(newTenant);
    setActiveTenantState(newTenant);
    setDropdownOpen(false);
    // Reload page or views to reflect isolated DB content
    window.location.reload();
  };

  const handleResetCurrentTenant = async () => {
    if (activeTenant.isTemplate) return;
    setIsResetting(true);
    try {
      await apiClient.resetTenant(activeTenant.slug);
      setDropdownOpen(false);
      window.location.reload();
    } catch (err) {
      console.error('Reset failed', err);
      alert('Failed to reset tenant database.');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <header className="h-16 flex items-center justify-between px-4 md:px-6 bg-bg-1 border-b border-line shadow-sm z-30 sticky top-0">
      <div className="flex items-center gap-3">
        <button 
          onClick={onMenuToggle}
          className="p-2 -ml-2 rounded-md hover:bg-bg-2 text-fg-1 md:hidden transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        
        {/* Global Command Palette Search Trigger */}
        <button
          type="button"
          onClick={handleOpenSearch}
          className="flex items-center bg-bg-2 hover:bg-bg-3 border border-line rounded-xl px-3 py-1.5 transition-all text-xs text-fg-2 gap-2 shadow-sm group"
        >
          <Search className="w-4 h-4 text-primary group-hover:scale-110 transition-transform" />
          <span className="hidden sm:inline">Search all 64 modules, tags (OCR, RAG)...</span>
          <span className="sm:hidden">Search...</span>
          <kbd className="hidden md:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono bg-bg-1 border border-line rounded text-fg-2 ml-2">
            ⌘K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        {/* Multi-Tenant Active Database Switcher Badge */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all shadow-sm ${
              activeTenant.isTemplate
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20'
            }`}
            title="Switch Active PostgreSQL Database"
          >
            <Database className="w-3.5 h-3.5" />
            <span className="max-w-[130px] sm:max-w-[180px] truncate">
              {activeTenant.isTemplate ? 'Master Demo (Template)' : activeTenant.name}
            </span>
            <ChevronDown className="w-3.5 h-3.5 opacity-70" />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-bg-1 border border-line rounded-2xl shadow-2xl py-3 px-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-line">
                <div>
                  <h4 className="text-xs font-bold text-fg-0">Active PostgreSQL Database</h4>
                  <p className="text-[11px] text-fg-2 font-mono">{activeTenant.db_name}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                  activeTenant.isTemplate ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                }`}>
                  {activeTenant.isTemplate ? 'Pristine Template' : 'Cloned Tenant DB'}
                </span>
              </div>

              {/* Tenants list */}
              <div className="my-3 space-y-1.5 max-h-52 overflow-y-auto pr-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-fg-2 mb-1">Available Databases</p>
                
                {/* Default Template DB */}
                <button
                  onClick={() => handleSelectTenant({ slug: 'default', name: 'NexusCampus AI Master Demo', db_name: 'nexus_default_demo' })}
                  className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors ${
                    activeTenant.isTemplate ? 'bg-primary/10 border border-primary/20 font-semibold text-primary' : 'hover:bg-bg-2 text-fg-1'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-amber-500 shrink-0" />
                    <div>
                      <p className="font-medium text-fg-0">Master Demo (Pristine Template)</p>
                      <p className="text-[10px] text-fg-2 font-mono">nexus_default_demo</p>
                    </div>
                  </div>
                  {activeTenant.isTemplate && <Check className="w-4 h-4 text-primary" />}
                </button>

                {/* Cloned Tenants */}
                {tenantsList.filter(t => t.slug !== 'default').map((t) => {
                  const isSelected = activeTenant.slug === t.slug;
                  return (
                    <button
                      key={t.slug}
                      onClick={() => handleSelectTenant(t)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left text-xs transition-colors ${
                        isSelected ? 'bg-primary/10 border border-primary/20 font-semibold text-primary' : 'hover:bg-bg-2 text-fg-1'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <Database className="w-4 h-4 text-emerald-500 shrink-0" />
                        <div>
                          <p className="font-medium text-fg-0">{t.name}</p>
                          <p className="text-[10px] text-fg-2 font-mono">{t.db_name}</p>
                        </div>
                      </div>
                      {isSelected && <Check className="w-4 h-4 text-primary" />}
                    </button>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-line space-y-2">
                <a
                  href="/setup"
                  className="w-full py-1.5 px-3 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Onboard New Campus (Clone DB)
                </a>

                {!activeTenant.isTemplate && (
                  <button
                    disabled={isResetting}
                    onClick={handleResetCurrentTenant}
                    className="w-full py-1.5 px-3 bg-bg-2 hover:bg-error/10 text-fg-2 hover:text-error border border-line hover:border-error/30 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                    Reset Tenant to Pristine Template
                  </button>
                )}

                <div className="flex items-center gap-1.5 text-[10px] text-fg-2 justify-center pt-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  <span>The master template DB is never modified.</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="hidden lg:flex items-center gap-1.5 text-xs text-fg-2 bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full">
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="font-semibold text-primary">NexusCampus AI Engine</span>
        </div>

        <button 
          onClick={toggleTheme}
          className="p-2 rounded-full hover:bg-bg-2 text-fg-1 transition-colors"
          aria-label="Toggle theme"
          title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5 text-warning" /> : <Moon className="w-5 h-5 text-fg-1" />}
        </button>

        {/* User Profile & Role Switcher Menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1 pl-2 rounded-xl hover:bg-bg-2 border border-line-soft transition-all ml-1"
            title="User Profile & Role Switcher"
          >
            <div className="flex flex-col items-end hidden sm:flex">
              <span className="text-xs font-bold text-fg-0 leading-tight">{user?.name || 'Administrator'}</span>
              <span className={`text-[10px] font-semibold uppercase leading-tight px-1.5 py-0.2 rounded-full ${roleBadgeColors[role] || 'bg-primary/20 text-primary'}`}>
                {role}
              </span>
            </div>
            {user?.avatar ? (
              <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full border border-primary/30 object-cover bg-bg-2" />
            ) : (
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-secondary text-white font-bold text-xs flex items-center justify-center shadow-sm">
                {(user?.name || 'A')[0]}
              </div>
            )}
            <ChevronDown className="w-3.5 h-3.5 text-fg-2" />
          </button>

          {/* User Menu Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-72 sm:w-80 bg-bg-1 border border-line rounded-2xl shadow-2xl py-3 px-4 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center gap-3 pb-3 border-b border-line">
                <img src={user?.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=User'} alt="User" className="w-10 h-10 rounded-full border border-line" />
                <div className="truncate">
                  <h4 className="text-xs font-bold text-fg-0 truncate">{user?.name}</h4>
                  <p className="text-[11px] text-fg-2 truncate">{user?.email}</p>
                  <span className={`text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 rounded-full mt-0.5 inline-block ${roleBadgeColors[role] || 'bg-primary/20 text-primary'}`}>
                    Role: {role}
                  </span>
                </div>
              </div>

              {/* Instant Role Persona Switcher */}
              <div className="my-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-bold text-fg-2 uppercase tracking-wider flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-primary" /> Switch Role Persona
                  </span>
                </div>

                <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                  {DEMO_PERSONAS.map((p) => {
                    const isCurrent = p.role_key === role;
                    return (
                      <button
                        key={p.role_key}
                        onClick={async () => {
                          await quickLogin(p.role_key);
                          setUserMenuOpen(false);
                          window.location.reload();
                        }}
                        className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left text-xs transition-colors ${
                          isCurrent ? 'bg-primary/10 border border-primary/20 font-semibold text-primary' : 'hover:bg-bg-2 text-fg-1'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <img src={p.avatar} alt={p.name} className="w-6 h-6 rounded-full shrink-0" />
                          <div className="truncate">
                            <p className="text-xs font-medium leading-tight text-fg-0 truncate">{p.title}</p>
                            <p className="text-[10px] text-fg-2 leading-tight truncate">{p.name}</p>
                          </div>
                        </div>
                        {isCurrent && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sign Out */}
              <div className="pt-2 border-t border-line">
                <button
                  onClick={logout}
                  className="w-full py-1.5 px-3 bg-bg-2 hover:bg-error/10 text-fg-2 hover:text-error border border-line hover:border-error/30 rounded-xl text-xs font-medium flex items-center justify-center gap-1.5 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
