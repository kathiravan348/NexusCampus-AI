import { useText } from "@nexus/i18n";
import { Button } from "@nexus/ui-core";
import { Link } from "react-router";

/** "Go to home" action shared by the not-found, module-off and forbidden pages. */
export function HomeLink() {
  const t = useText();
  return (
    <Button asChild variant="secondary">
      <Link to="/">{t("common.shell.goHome")}</Link>
    </Button>
  );
}
