import type { Subscription } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useSubscriptions } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, type DataTableProps } from "@nexus/ui-core";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames, useCatalogueNames } from "../../app/names";
import { PERIOD_KEY, SUB_STATUS } from "./labels";

export function SubscriptionsTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const subs = useSubscriptions();
  const accounts = useAccountNames();
  const items = useCatalogueNames();

  const columns = useMemo<DataTableProps<Subscription>["columns"]>(
    () => [
      {
        id: "account",
        header: t("p03.col.account"),
        meta: { primary: true },
        cell: ({ row }) => accounts.get(row.original.accountId) ?? row.original.accountId,
      },
      {
        id: "plan",
        header: t("p03.subs.plan"),
        enableSorting: false,
        cell: ({ row }) => (
          <span>
            {items.get(row.original.planItemId) ?? row.original.planItemId}
            {row.original.addonItemIds.length > 0 && (
              <span className="ms-1 text-body-sm text-text-secondary">
                {t("p03.subs.addons", { count: row.original.addonItemIds.length })}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "status",
        header: t("p03.col.status"),
        enableSorting: false,
        cell: ({ row }) => {
          const s = SUB_STATUS[row.original.status];
          return (
            <span className="flex flex-col gap-1">
              <Badge tone={s.tone}>{t(s.key)}</Badge>
              {row.original.trialEndsAt && (
                <span className="text-body-sm text-text-secondary">
                  {t("p03.subs.trialEnds", { date: fmt.date(row.original.trialEndsAt) })}
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: "period",
        header: t("p03.subs.period"),
        enableSorting: false,
        cell: ({ row }) => t(PERIOD_KEY[row.original.period]),
      },
      {
        id: "learners",
        accessorKey: "learners",
        header: t("p03.subs.learners"),
        cell: ({ row }) => (
          <span className="tabular-nums">{fmt.number(row.original.learners)}</span>
        ),
      },
      {
        id: "current",
        header: t("p03.subs.current"),
        enableSorting: false,
        cell: ({ row }) =>
          t("p03.subs.range", {
            start: fmt.date(row.original.currentPeriodStart),
            end: fmt.date(row.original.currentPeriodEnd),
          }),
      },
    ],
    [t, fmt, accounts, items],
  );

  return (
    <DataTable
      caption={t("p03.subs.caption")}
      columns={columns}
      data={subs.data?.items ?? []}
      getRowId={(s) => s.id}
      loading={subs.isPending}
      error={subs.isError ? <EmptyState tone="error" /> : undefined}
    />
  );
}
