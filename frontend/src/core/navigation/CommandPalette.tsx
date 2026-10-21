import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, 
  ArrowRight, 
  Sparkles, 
  Zap, 
  CheckCircle2, 
  Clock, 
  X,
  Compass
} from 'lucide-react';
import { MODULES_REGISTRY, PORTALS, PortalKey, ModuleItem } from '../../modules/registry';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [selectedPortal, setSelectedPortal] = useState<PortalKey | 'all'>('all');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Global shortcut (Cmd+K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (isOpen) onClose();
        else {
          // Open triggered from parent or event
          window.dispatchEvent(new CustomEvent('toggle-command-palette'));
        }
      } else if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Quick Action items
  const quickActions = useMemo(() => [
    { id: 'qa-1', label: 'Admissions Pipeline & Kanban', route: '/admissions', icon: Zap, category: 'Quick Action' },
    { id: 'qa-2', label: 'Student 360 Profile Directory', route: '/student/profile', icon: Zap, category: 'Quick Action' },
    { id: 'qa-3', label: 'LMS Course Syllabus Builder', route: '/lms/course-builder', icon: Zap, category: 'Quick Action' },
    { id: 'qa-4', label: 'Online Quiz & Assessment Engine', route: '/lms/quiz', icon: Zap, category: 'Quick Action' },
    { id: 'qa-5', label: 'Finance & Student Invoicing', route: '/finance', icon: Zap, category: 'Quick Action' },
    { id: 'qa-6', label: 'HR Faculty & Staff Directory', route: '/hr/staff', icon: Zap, category: 'Quick Action' },
    { id: 'qa-7', label: 'Master Class Timetable Grid', route: '/operations/timetable', icon: Zap, category: 'Quick Action' },
  ], []);

  // Filter modules
  const filteredModules = useMemo(() => {
    const q = query.toLowerCase().trim();
    return MODULES_REGISTRY.filter((mod) => {
      const matchPortal = selectedPortal === 'all' || mod.portal === selectedPortal;
      if (!matchPortal) return false;
      if (!q) return true;

      const matchId = mod.id.toLowerCase().includes(q);
      const matchTitle = mod.title.toLowerCase().includes(q);
      const matchSummary = mod.summary.toLowerCase().includes(q);
      const matchTags = mod.tags.some(t => t.toLowerCase().includes(q));
      return matchId || matchTitle || matchSummary || matchTags;
    });
  }, [query, selectedPortal]);

  // Combined selectable items
  const combinedItems = useMemo(() => {
    if (!query) {
      return [
        ...quickActions.map(qa => ({ type: 'action' as const, data: qa })),
        ...filteredModules.map(m => ({ type: 'module' as const, data: m }))
      ];
    }
    return filteredModules.map(m => ({ type: 'module' as const, data: m }));
  }, [query, quickActions, filteredModules]);

  // Handle arrow key navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, combinedItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + combinedItems.length) % Math.max(1, combinedItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = combinedItems[selectedIndex];
      if (current) {
        if (current.type === 'action') {
          navigate(current.data.route);
        } else {
          navigate(current.data.route);
        }
        onClose();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-md flex items-start justify-center pt-16 md:pt-24 px-4 animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="w-full max-w-3xl bg-bg-1 border border-line rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-scale-up"
        role="dialog"
        aria-modal="true"
      >
        {/* Search Bar Input */}
        <div className="flex items-center px-5 py-4 border-b border-line bg-bg-2/60 relative">
          <Search className="w-5 h-5 text-primary shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search all 64 modules, tags (e.g. OCR, RAG), or type 'M03'..."
            className="w-full bg-transparent text-fg-0 placeholder:text-fg-2 text-base outline-none pr-10"
          />
          {query ? (
            <button 
              onClick={() => setQuery('')}
              className="p-1 text-fg-2 hover:text-fg-0 rounded-md"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono text-fg-2 bg-bg-3 border border-line rounded">
              ESC to close
            </kbd>
          )}
        </div>

        {/* Portal Filter Chips */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-line bg-bg-1 overflow-x-auto text-xs scrollbar-none">
          <button
            onClick={() => setSelectedPortal('all')}
            className={`px-3 py-1 rounded-full whitespace-nowrap transition-all font-medium ${
              selectedPortal === 'all'
                ? 'bg-primary text-white shadow-sm'
                : 'bg-bg-2 text-fg-2 hover:text-fg-0 hover:bg-bg-3'
            }`}
          >
            All 64 Modules
          </button>
          {(Object.keys(PORTALS) as PortalKey[]).map((key) => {
            const portal = PORTALS[key];
            const isSelected = selectedPortal === key;
            return (
              <button
                key={key}
                onClick={() => setSelectedPortal(key)}
                className={`px-3 py-1 rounded-full whitespace-nowrap transition-all font-medium flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-primary text-white shadow-sm'
                    : 'bg-bg-2 text-fg-2 hover:text-fg-0 hover:bg-bg-3'
                }`}
              >
                <span>{portal.name.split('&')[0].trim()}</span>
              </button>
            );
          })}
        </div>

        {/* Search Results List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {combinedItems.length === 0 ? (
            <div className="py-12 text-center text-fg-2">
              <Compass className="w-10 h-10 mx-auto text-fg-2/40 mb-3" />
              <p className="text-sm font-medium">No matching modules or actions found</p>
              <p className="text-xs text-fg-2/70 mt-1">Try searching by module ID (e.g. M15, M03) or keyword</p>
            </div>
          ) : (
            combinedItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;

              if (item.type === 'action') {
                const qa = item.data;
                const Icon = qa.icon;
                return (
                  <div
                    key={qa.id}
                    onClick={() => {
                      navigate(qa.route);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={`flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-primary/15 text-primary border border-primary/30'
                        : 'hover:bg-bg-2 text-fg-0 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{qa.label}</div>
                        <div className="text-xs text-fg-2">{qa.category}</div>
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 opacity-70" />
                  </div>
                );
              }

              const mod = item.data as ModuleItem;
              const isImplemented = mod.status === 'implemented';

              return (
                <div
                  key={mod.id}
                  onClick={() => {
                    navigate(mod.route);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-start justify-between px-4 py-3 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-primary/15 border border-primary/30'
                      : 'hover:bg-bg-2 border border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="px-2 py-1 rounded-md bg-bg-3 border border-line text-xs font-mono font-bold text-primary shrink-0 mt-0.5">
                      {mod.id}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-fg-0 truncate">
                          {mod.title}
                        </span>
                        {isImplemented ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                            <CheckCircle2 className="w-3 h-3" /> Live Demo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-fg-2 bg-bg-3 px-2 py-0.5 rounded-full border border-line">
                            <Clock className="w-3 h-3" /> Planned
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-fg-2 mt-1 truncate">
                        {mod.summary}
                      </p>
                      {mod.tags.length > 0 && (
                        <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                          {mod.tags.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] font-medium px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-fg-2 shrink-0 ml-3 self-center">
                    <span className="text-xs hidden md:inline font-mono text-fg-2/80">
                      {mod.route}
                    </span>
                    <ArrowRight className="w-4 h-4 opacity-70" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-4 py-2.5 bg-bg-2 border-t border-line flex items-center justify-between text-[11px] text-fg-2">
          <div className="flex items-center gap-3">
            <span>Use <kbd className="font-mono bg-bg-1 px-1.5 py-0.5 rounded border border-line">↑</kbd> <kbd className="font-mono bg-bg-1 px-1.5 py-0.5 rounded border border-line">↓</kbd> to navigate</span>
            <span><kbd className="font-mono bg-bg-1 px-1.5 py-0.5 rounded border border-line">Enter</kbd> to open</span>
          </div>
          <div className="flex items-center gap-1.5 text-primary font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>64 Product Modules Indexed</span>
          </div>
        </div>
      </div>
    </div>
  );
};
