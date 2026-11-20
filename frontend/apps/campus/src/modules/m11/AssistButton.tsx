import { useText } from "@nexus/i18n";
import { useEntitlements, useMe } from "@nexus/services";
import { IconButton } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router";
import { MODULES } from "../../app/modules";
import { AssistPanel } from "./AssistPanel";

/**
 * Header button that opens Assist. Hidden when M11 is not entitled, the user may not use Assist, or the
 * current screen's module is AI-blocked (e.g. M83).
 */
export function AssistButton() {
  const t = useText();
  const { pathname } = useLocation();
  const entitlements = useEntitlements();
  const me = useMe();
  const [open, setOpen] = useState(false);

  const entitled = entitlements.data?.items.some((e) => e.moduleId === "M11" && e.enabled) ?? false;
  const allowed = me.data?.permissions.includes("m11.assist.use") ?? false;
  const here = MODULES.find((m) => pathname === `/${m.path}` || pathname.startsWith(`/${m.path}/`));
  if (!entitled || !allowed || here?.aiBlocked) return null;

  return (
    <>
      <IconButton
        icon={<Sparkles className="h-4 w-4" />}
        aria-label={t("m11.panel.open")}
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      />
      <AssistPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
