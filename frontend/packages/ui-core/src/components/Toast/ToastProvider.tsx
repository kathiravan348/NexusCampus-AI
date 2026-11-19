import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useText } from "@nexus/i18n";
import { cn } from "../../lib/cn";
import { IconButton } from "../IconButton/IconButton";
import { ToastContext, type ToastItem, type ToastOptions, type ToastTone } from "./toastContext";

export interface ToastProviderProps {
  children: React.ReactNode;
}

const TONE_BORDER: Readonly<Record<ToastTone, string>> = {
  info: "border-s-info",
  success: "border-s-success",
  warning: "border-s-warning",
  danger: "border-s-danger",
};

function renderToneIcon(tone: ToastTone): React.ReactElement {
  switch (tone) {
    case "success":
      return <CircleCheck className="h-5 w-5 text-success-text shrink-0" aria-hidden="true" />;
    case "warning":
      return <TriangleAlert className="h-5 w-5 text-warning-text shrink-0" aria-hidden="true" />;
    case "danger":
      return <CircleAlert className="h-5 w-5 text-danger-text shrink-0" aria-hidden="true" />;
    default:
      return <Info className="h-5 w-5 text-info-text shrink-0" aria-hidden="true" />;
  }
}

export function ToastProvider({ children }: ToastProviderProps): React.ReactElement {
  const t = useText();
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  const show = React.useCallback((options: ToastOptions) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast: ToastItem = { ...options, id };
    setToasts((prev) => [...prev.slice(-2), newToast]);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const contextValue = React.useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={contextValue}>
      <ToastPrimitive.Provider label={t("common.notifications")} swipeDirection="down">
        {children}

        {toasts.map((toast) => {
          const tone: ToastTone = toast.tone ?? "info";
          const isUrgent = tone === "danger" || tone === "warning";

          return (
            <ToastPrimitive.Root
              key={toast.id}
              data-tone={tone}
              type={isUrgent ? "foreground" : "background"}
              duration={toast.durationMs ?? 5000}
              onOpenChange={(open) => {
                if (!open) {
                  removeToast(toast.id);
                }
              }}
              className={cn(
                "flex items-start gap-3 w-full rounded-md border border-border-default border-s-4 bg-bg-surface p-4 shadow-lg",
                TONE_BORDER[tone],
                "data-[swipe=move]:translate-y-[var(--radix-toast-swipe-move-y)]",
              )}
            >
              <div className="pt-0.5">{renderToneIcon(tone)}</div>

              <div className="flex-1 min-w-0 space-y-1">
                <ToastPrimitive.Title className="font-sans text-body font-semibold text-text-primary">
                  {toast.title}
                </ToastPrimitive.Title>
                {toast.description && (
                  <ToastPrimitive.Description className="text-body-sm text-text-secondary">
                    {toast.description}
                  </ToastPrimitive.Description>
                )}
              </div>

              <ToastPrimitive.Close asChild>
                <IconButton
                  icon={<X className="h-4 w-4" />}
                  aria-label={t("common.closeNotification")}
                  variant="ghost"
                  size="sm"
                  className="shrink-0 -me-2 -mt-2"
                />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}

        <ToastPrimitive.Viewport className="fixed bottom-0 end-0 z-50 flex flex-col gap-2 p-4 w-full md:max-w-sm max-w-full pointer-events-none [&>*]:pointer-events-auto" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
