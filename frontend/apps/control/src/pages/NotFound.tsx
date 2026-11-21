import { useControlText } from "@nexus/i18n/control";
import { Button, EmptyState } from "@nexus/ui-core";
import { Link } from "react-router";

export function NotFound() {
  const t = useControlText();
  return (
    <EmptyState
      title={t("common.shell.notFoundTitle")}
      description={t("common.shell.notFoundBody")}
      action={
        <Button asChild variant="secondary">
          <Link to="/">{t("common.shell.goHome")}</Link>
        </Button>
      }
    />
  );
}
