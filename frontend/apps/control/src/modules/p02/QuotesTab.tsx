import type { Quote } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useAccounts, useQuotes, useStaffCan } from "@nexus/services/control";
import { Badge, Button, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { useControlFormat } from "../../app/format";
import { QUOTE_STATUS_KEY, QUOTE_STATUS_TONE } from "./labels";
import { SendQuoteModal } from "./SendQuoteModal";

/** Quotes with totals; draft quotes can be sent by staff with `ctl.quote.manage`. */
export function QuotesTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const can = useStaffCan();
  const quotes = useQuotes();
  const accounts = useAccounts();
  const [sending, setSending] = useState<Quote | null>(null);
  const names = useMemo(
    () => new Map((accounts.data?.items ?? []).map((a) => [a.id, a.name])),
    [accounts.data],
  );
  const canSend = can("ctl.quote.manage");

  const columns = useMemo<DataTableProps<Quote>["columns"]>(
    () => [
      {
        id: "number",
        accessorKey: "number",
        header: t("p02.quotes.number"),
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{row.original.number}</span>
            {row.original.aiDrafted && (
              <Badge tone="info">
                <Sparkles className="me-1 h-3 w-3" aria-hidden="true" />
                {t("p02.quotes.aiDraft")}
              </Badge>
            )}
          </span>
        ),
      },
      {
        id: "account",
        header: t("p02.quotes.account"),
        enableSorting: false,
        cell: ({ row }) => names.get(row.original.accountId) ?? row.original.accountId,
      },
      {
        id: "status",
        header: t("p02.quotes.status"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge tone={QUOTE_STATUS_TONE[row.original.status]}>
            {t(QUOTE_STATUS_KEY[row.original.status])}
          </Badge>
        ),
      },
      {
        id: "total",
        accessorKey: "totalMinor",
        header: t("p02.quotes.total"),
        cell: ({ row }) => (
          <span className="tabular-nums">
            {fmt.money(row.original.totalMinor, row.original.currency)}
          </span>
        ),
      },
      {
        id: "valid",
        accessorKey: "validUntil",
        header: t("p02.quotes.validUntil"),
        cell: ({ row }) => fmt.date(row.original.validUntil),
      },
      {
        id: "actions",
        header: "",
        enableSorting: false,
        cell: ({ row }) =>
          canSend && row.original.status === "draft" ? (
            <Button
              size="sm"
              variant="secondary"
              aria-label={t("p02.quotes.sendLabel", { number: row.original.number })}
              onClick={() => setSending(row.original)}
            >
              {t("p02.quotes.send")}
            </Button>
          ) : null,
      },
    ],
    [t, fmt, names, canSend],
  );

  return (
    <>
      <DataTable
        caption={t("p02.quotes.caption")}
        columns={columns}
        data={quotes.data?.items ?? []}
        getRowId={(q) => q.id}
        loading={quotes.isPending}
        error={quotes.isError ? <EmptyState tone="error" /> : undefined}
        emptyState={<EmptyState description={t("p02.quotes.empty")} />}
      />
      {sending && (
        <SendQuoteModal
          quote={sending}
          accountName={names.get(sending.accountId) ?? sending.accountId}
          open
          onOpenChange={(open) => {
            if (!open) setSending(null);
          }}
        />
      )}
    </>
  );
}
