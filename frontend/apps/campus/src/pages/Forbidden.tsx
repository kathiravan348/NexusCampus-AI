import { useText } from "@nexus/i18n";
import { EmptyState } from "@nexus/ui-core";
import { ShieldX } from "lucide-react";
import { HomeLink } from "./HomeLink";

/** The user's role does not allow this page. */
export function Forbidden() {
  const t = useText();
  return (
    <EmptyState
      icon={<ShieldX className="h-6 w-6" />}
      title={t("common.shell.forbiddenTitle")}
      description={t("common.shell.forbiddenBody")}
      action={<HomeLink />}
    />
  );
}
