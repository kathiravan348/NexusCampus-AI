import { brand } from "@nexus/brand";
import { useText } from "@nexus/i18n";
import { startRealSignIn, useSession } from "@nexus/services";
import { Button, Card } from "@nexus/ui-core";
import { LogIn } from "lucide-react";
import { useState } from "react";
import { Navigate, useLocation } from "react-router";
import { PlatformMark } from "./PlatformMark";

/** Where the guard sent the user from (`/sign-in` state), so they come back there after Keycloak. */
function returnPath(state: unknown): string {
  const from = (state as { from?: unknown } | null)?.from;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}

/** Real installs (NEX-060): one button that opens the institution's Keycloak sign-in; no demo picker. */
export function RealSignIn() {
  const t = useText();
  const { session } = useSession();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-bg-ground text-text-primary">
      <main id="main-content" className="mx-auto max-w-md space-y-6 px-4 py-12 md:px-7">
        <div className="flex items-center gap-3">
          <PlatformMark size="md" decorative />
          <span className="font-sans text-section-title font-semibold text-text-primary">
            {brand.name}
          </span>
        </div>
        <Card>
          <div className="space-y-4">
            <h1 className="font-sans text-page-title font-semibold">{t("m02.signIn.realTitle")}</h1>
            <p className="text-body text-text-secondary">{t("m02.signIn.realIntro")}</p>
            <Button
              loading={busy}
              onClick={() => {
                setBusy(true);
                startRealSignIn(returnPath(location.state));
              }}
            >
              <LogIn className="h-4 w-4" aria-hidden />
              {t("m02.signIn.realButton")}
            </Button>
          </div>
        </Card>
      </main>
    </div>
  );
}
