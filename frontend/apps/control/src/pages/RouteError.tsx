import { useControlText } from "@nexus/i18n/control";
import { Button, EmptyState } from "@nexus/ui-core";

/** Shown when a page crashes: a calm error with a way home, never a stack trace. */
export function RouteError() {
  const t = useControlText();
  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      <EmptyState
        tone="error"
        action={
          <Button asChild variant="secondary">
            <a href="/">{t("common.shell.goHome")}</a>
          </Button>
        }
      />
    </main>
  );
}
