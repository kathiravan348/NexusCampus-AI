import { useText } from "@nexus/i18n";
import { IconButton } from "@nexus/ui-core";
import { Download } from "lucide-react";
import { useEffect, useState } from "react";

/** The non-standard event Chromium fires when the app can be installed. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** Header install button: shown only while the browser offers installation (no fake button). */
export function InstallPrompt() {
  const t = useText();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!deferred) return null;
  return (
    <IconButton
      icon={<Download className="h-4 w-4" />}
      aria-label={t("common.pwa.install")}
      variant="ghost"
      size="sm"
      onClick={() => {
        void deferred.prompt();
        void deferred.userChoice.finally(() => setDeferred(null));
      }}
    />
  );
}
