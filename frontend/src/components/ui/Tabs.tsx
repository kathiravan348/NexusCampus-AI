import * as React from 'react';
import { cn } from '../../lib/utils';

interface TabsContextValue {
  value: string;
  onValueChange: (value: string) => void;
}

const TabsContext = React.createContext<TabsContextValue | undefined>(undefined);

export function Tabs({ defaultValue, value, onValueChange, className, children }: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
  children: React.ReactNode;
}) {
  const [tabValue, setTabValue] = React.useState(value || defaultValue || '');

  const handleValueChange = React.useCallback(
    (newValue: string) => {
      setTabValue(newValue);
      onValueChange?.(newValue);
    },
    [onValueChange]
  );

  React.useEffect(() => {
    if (value !== undefined) {
      setTabValue(value);
    }
  }, [value]);

  return (
    <TabsContext.Provider value={{ value: tabValue, onValueChange: handleValueChange }}>
      <div className={cn('flex flex-col', className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex border-b border-line gap-6 px-2 overflow-x-auto custom-scrollbar', className)}>
      {children}
    </div>
  );
}

export function TabsTrigger({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error('TabsTrigger must be used within a Tabs component');

  const isActive = context.value === value;

  return (
    <button
      type="button"
      onClick={() => context.onValueChange(value)}
      className={cn(
        'pb-3 font-semibold text-sm border-b-2 whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-0',
        isActive ? 'border-primary text-primary' : 'border-transparent text-fg-2 hover:text-fg-0',
        className
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children: React.ReactNode }) {
  const context = React.useContext(TabsContext);
  if (!context) throw new Error('TabsContent must be used within a Tabs component');

  if (context.value !== value) return null;

  return (
    <div className={cn('mt-4 outline-none focus-visible:ring-2 focus-visible:ring-primary', className)} tabIndex={0}>
      {children}
    </div>
  );
}
