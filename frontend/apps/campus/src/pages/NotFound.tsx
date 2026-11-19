import { useText } from "@nexus/i18n";
import { EmptyState } from "@nexus/ui-core";
import { SearchX } from "lucide-react";
import { HomeLink } from "./HomeLink";

export function NotFound() {
  const t = useText();
  return (
    <EmptyState
      icon={<SearchX className="h-6 w-6" />}
      title={t("common.shell.notFoundTitle")}
      description={t("common.shell.notFoundBody")}
      action={<HomeLink />}
    />
  );
}
