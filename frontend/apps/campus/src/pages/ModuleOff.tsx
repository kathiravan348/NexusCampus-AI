import { useText } from "@nexus/i18n";
import { EmptyState } from "@nexus/ui-core";
import { PackageX } from "lucide-react";
import { HomeLink } from "./HomeLink";

/** The tenant's plan does not include this module: a clear notice, never a broken page. */
export function ModuleOff() {
  const t = useText();
  return (
    <EmptyState
      icon={<PackageX className="h-6 w-6" />}
      title={t("common.shell.moduleOffTitle")}
      description={t("common.shell.moduleOffBody")}
      action={<HomeLink />}
    />
  );
}
