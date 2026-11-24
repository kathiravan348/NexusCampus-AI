import type { JournalEntry, LedgerAccount } from "@nexus/contracts";
import { formatDate, formatMoney, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { Button, EmptyState } from "@nexus/ui-core";
import { useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { PostJournalDialog } from "./PostJournalDialog";

interface Props {
  readonly entries: readonly JournalEntry[];
  readonly accounts: ReadonlyMap<string, LedgerAccount>;
  readonly canManage: boolean;
  readonly online: boolean;
}

export function JournalTab({ entries, accounts, canManage, online }: Props) {
  const t = useText();
  const { locale } = useRuntime();
  const currencyLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const [show, setShow] = useState(false);
  const ordered = [...entries].sort(
    (a, b) => b.postedOn.localeCompare(a.postedOn) || b.createdAt.localeCompare(a.createdAt),
  );
  return (
    <div className="space-y-3">
      {canManage && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!online && <span id="m19-journal-offline">{t("common.offline")}</span>}
          <Button
            disabled={!online}
            aria-describedby={!online ? "m19-journal-offline" : undefined}
            onClick={() => setShow(true)}
          >
            {t("m19.journal.postEntry")}
          </Button>
        </div>
      )}
      {ordered.length === 0 && <EmptyState title={t("m19.journal.empty")} />}
      {ordered.map((entry) => (
        <details
          key={entry.id}
          className="rounded-md border border-border-default bg-bg-raised p-3"
        >
          <summary className="cursor-pointer text-body">
            <span className="inline-flex flex-wrap gap-x-3 gap-y-1 align-middle">
              <span className="font-semibold break-all">{entry.reference}</span>
              <span>{formatDate(entry.postedOn, { locale: currencyLocale })}</span>
              <span>{t(`m19.source.${entry.source}`)}</span>
              <span>
                {t("m19.journal.totalDebit")} ·{" "}
                {formatMoney(
                  entry.lines.reduce((sum, line) => sum + line.debit, 0),
                  entry.currency,
                  currencyLocale,
                )}
              </span>
            </span>
          </summary>
          <ul className="mt-3 space-y-2">
            {entry.lines.map((line, idx) => {
              const account = accounts.get(line.accountId);
              return (
                <li
                  key={idx}
                  className="flex flex-col gap-x-3 rounded-md border border-border-default p-2 md:flex-row"
                >
                  <span>
                    {account ? `${account.code} — ${account.name}` : t("m19.account.unavailable")}
                  </span>
                  <span>
                    {t("m19.line.debit")} ·{" "}
                    {formatMoney(line.debit, entry.currency, currencyLocale)}
                  </span>
                  <span>
                    {t("m19.line.credit")} ·{" "}
                    {formatMoney(line.credit, entry.currency, currencyLocale)}
                  </span>
                </li>
              );
            })}
          </ul>
        </details>
      ))}
      {canManage && show && (
        <PostJournalDialog
          accounts={Array.from(accounts.values())}
          online={online}
          onOpenChange={setShow}
        />
      )}
    </div>
  );
}
