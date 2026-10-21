import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { DialogContextType, DialogInstance, ConfirmOptions } from './types';
import { ConfirmDialog } from './ConfirmDialog';

const DialogContext = createContext<DialogContextType | null>(null);

export const useDialog = () => {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
};

export const DialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [dialogs, setDialogs] = useState<DialogInstance[]>([]);
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null);

  const openDialog = useCallback(
    (
      id: string,
      component: React.ComponentType<any>,
      props: Record<string, any> = {},
      options: { title?: string; size?: 'sm' | 'md' | 'lg' | 'xl' | 'full' | 'drawer' } = {}
    ) => {
      setDialogs((prev) => [
        ...prev.filter((d) => d.id !== id),
        {
          id,
          component,
          props,
          title: options.title,
          size: options.size || 'md'
        }
      ]);
    },
    []
  );

  const closeDialog = useCallback((id?: string) => {
    setDialogs((prev) => (id ? prev.filter((d) => d.id !== id) : prev.slice(0, -1)));
  }, []);

  const openConfirm = useCallback((options: ConfirmOptions) => {
    setConfirmOptions(options);
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmOptions(null);
  }, []);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (confirmOptions) {
          closeConfirm();
        } else if (dialogs.length > 0) {
          closeDialog();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmOptions, dialogs, closeConfirm, closeDialog]);

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
    xl: 'max-w-5xl',
    full: 'max-w-[95vw] h-[92vh]',
    drawer: 'max-w-md ml-auto h-full rounded-none border-l'
  };

  return (
    <DialogContext.Provider value={{ openDialog, closeDialog, openConfirm, closeConfirm }}>
      {children}

      {/* Confirmation Dialog */}
      <ConfirmDialog options={confirmOptions} onClose={closeConfirm} />

      {/* Dynamic Modals and Drawers */}
      {dialogs.map((dialog) => {
        const Component = dialog.component;
        const isDrawer = dialog.size === 'drawer';

        return (
          <div
            key={dialog.id}
            className={`fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex ${
              isDrawer ? 'justify-end' : 'items-center justify-center p-4'
            } animate-fade-in`}
            onClick={(e) => {
              if (e.target === e.currentTarget) closeDialog(dialog.id);
            }}
          >
            <div
              className={`w-full bg-bg-1 border border-line shadow-2xl overflow-hidden flex flex-col ${
                sizeClasses[dialog.size || 'md']
              } ${isDrawer ? 'h-full animate-slide-left' : 'rounded-2xl max-h-[90vh] animate-scale-up'}`}
              role="dialog"
              aria-modal="true"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-line bg-bg-2/50 shrink-0">
                <h3 className="text-base font-bold text-fg-0">
                  {dialog.title || 'Action Window'}
                </h3>
                <button
                  onClick={() => closeDialog(dialog.id)}
                  className="p-1 rounded-lg text-fg-2 hover:text-fg-0 hover:bg-bg-3 transition-colors"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6">
                <Component {...dialog.props} onClose={() => closeDialog(dialog.id)} />
              </div>
            </div>
          </div>
        );
      })}
    </DialogContext.Provider>
  );
};
