import { useText } from "@nexus/i18n";
import { useForms } from "@nexus/services";
import { Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";

export function FormsTab() {
  const t = useText();
  const forms = useForms();
  if (!forms.data) {
    if (forms.isPending) return <Skeleton className="h-24 w-full" />;
    return (
      <EmptyState
        tone="error"
        title={t("common.error")}
        action={
          <Button variant="secondary" onClick={() => void forms.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!forms.data.items.length) return <EmptyState title={t("m08.forms.empty")} />;
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {forms.data.items.map((form) => (
        <li key={form.id} className="min-w-0">
          <Card title={<span className="break-words">{form.name}</span>}>
            {t("m08.forms.count", { count: form.fieldKeys.length })}
          </Card>
        </li>
      ))}
    </ul>
  );
}
