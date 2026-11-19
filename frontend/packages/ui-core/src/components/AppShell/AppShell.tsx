import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { useText } from "@nexus/i18n";
import { cn } from "../../lib/cn";
import { IconButton } from "../IconButton/IconButton";
import { AppShellContext } from "./appShellContext";

export interface AppShellProps {
  brand: React.ReactNode;
  nav: React.ReactNode;
  navFooter?: React.ReactNode;
  title?: React.ReactNode;
  actions?: React.ReactNode;
  banner?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function AppShell({
  brand,
  nav,
  navFooter,
  title,
  actions,
  banner,
  children,
  className,
}: AppShellProps): React.ReactElement {
  const t = useText();
  const [menuOpen, setMenuOpen] = React.useState(false);

  const closeMenu = React.useCallback(() => {
    setMenuOpen(false);
  }, []);

  const contextValue = React.useMemo(() => ({ closeMenu }), [closeMenu]);

  return (
    <AppShellContext.Provider value={contextValue}>
      <div className={cn("min-h-screen bg-bg-ground text-text-primary", className)}>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-bg-raised focus:border focus:border-border-default focus:rounded-md focus:text-body focus:text-text-primary focus:outline-none focus:ring-2 focus:ring-brand-primary"
        >
          {t("common.skipToContent")}
        </a>

        <Dialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-bg-ground/80 backdrop-blur-xs transition-opacity" />
            <Dialog.Content
              aria-label={t("common.navigationMenu")}
              aria-describedby={undefined}
              className="fixed inset-y-0 start-0 z-50 flex flex-col w-(--sidebar-width) max-w-[85vw] bg-bg-sidebar border-e border-border-default shadow-lg focus:outline-hidden"
            >
              <Dialog.Title className="sr-only">{t("common.navigationMenu")}</Dialog.Title>
              <div className="flex items-center justify-between h-14 px-4 border-b border-border-default">
                <div>{brand}</div>
                <Dialog.Close asChild>
                  <IconButton
                    icon={<X className="h-4 w-4" />}
                    aria-label={t("common.closeMenu")}
                    variant="ghost"
                    size="sm"
                  />
                </Dialog.Close>
              </div>
              <nav
                aria-label={t("common.mainNavigation")}
                className="flex-1 overflow-y-auto px-3 py-4 space-y-1"
              >
                {nav}
              </nav>
              {navFooter && (
                <div className="p-4 border-t border-border-default shrink-0">{navFooter}</div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>

        <aside className="hidden md:flex md:flex-col fixed inset-y-0 start-0 z-30 w-(--sidebar-width) bg-bg-sidebar border-e border-border-default">
          <div className="flex items-center h-14 px-5 border-b border-border-default">{brand}</div>
          <nav
            aria-label={t("common.mainNavigation")}
            className="flex-1 overflow-y-auto px-3 py-4 space-y-1"
          >
            {nav}
          </nav>
          {navFooter && (
            <div className="p-4 border-t border-border-default shrink-0">{navFooter}</div>
          )}
        </aside>

        <div className="flex flex-col min-h-screen md:ps-(--sidebar-width)">
          {banner && <div className="w-full">{banner}</div>}

          <header className="sticky top-0 z-20 flex items-center justify-between gap-3 h-14 px-4 md:px-7 border-b border-border-default bg-bg-ground/90 backdrop-blur-xs">
            <div className="flex items-center gap-3 min-w-0">
              <IconButton
                icon={<Menu className="h-5 w-5" />}
                aria-label={t("common.openMenu")}
                variant="ghost"
                size="sm"
                className="md:hidden"
                onClick={() => setMenuOpen(true)}
              />
              {title && (
                <div className="font-sans text-section-title text-text-primary truncate">
                  {title}
                </div>
              )}
            </div>
            {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
          </header>

          <main
            id="main-content"
            tabIndex={-1}
            className="flex-1 px-4 md:px-7 py-6 focus:outline-hidden"
          >
            {children}
          </main>
        </div>
      </div>
    </AppShellContext.Provider>
  );
}
