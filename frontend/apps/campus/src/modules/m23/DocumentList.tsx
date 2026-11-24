import type { IssuedDocumentRead } from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { Badge, EmptyState } from "@nexus/ui-core";
import { useRuntime } from "../../app/TenantRuntime";

interface Props {
  readonly documents: readonly IssuedDocumentRead[];
  readonly names: ReadonlyMap<string, string>;
  readonly onOpen: (id: string) => void;
}

export function DocumentList({ documents, names, onOpen }: Props) {
  const t = useText();
  const { locale } = useRuntime();
  const local = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  if (!documents.length) return <EmptyState title={t("m23.list.empty")} />;
  return (
    <ul aria-label={t("m23.nav.title")} className="space-y-3">
      {documents.map((row) => (
        <li key={row.id} className="rounded-lg border border-border-default bg-bg-surface">
          <button
            type="button"
            className="flex min-h-11 w-full flex-col items-start gap-2 break-words rounded-lg p-4 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
            onClick={() => onOpen(row.id)}
          >
            <span className="font-semibold">{t(`m23.kind.${row.kind}`)}</span>
            <bdi className="max-w-full">{row.number}</bdi>
            <span>{formatDate(row.issuedOn, { locale: local })}</span>
            <span>
              {row.learnerId === null
                ? t("m23.list.staffLetter")
                : (names.get(row.learnerId) ?? t("term.learner"))}
            </span>
            {row.revoked && <Badge tone="warning">{t("m23.view.revoked")}</Badge>}
          </button>
        </li>
      ))}
    </ul>
  );
}
