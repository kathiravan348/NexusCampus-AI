import type { CatalogueItem } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useCatalogue } from "@nexus/services/control";
import { DataTable, EmptyState, Select, type DataTableProps } from "@nexus/ui-core";
import { useMemo, useState } from "react";
import { useControlFormat } from "../../app/format";
import { KIND_KEY, UNIT_KEY } from "./labels";

/** Everything we sell, priced for one country at a time (P02). */
export function CatalogueTab() {
  const t = useControlText();
  const fmt = useControlFormat();
  const catalogue = useCatalogue();
  const items = useMemo(() => catalogue.data?.items ?? [], [catalogue.data]);
  const countries = useMemo(
    () => [...new Set(items.flatMap((i) => i.prices.map((p) => p.country)))].sort(),
    [items],
  );
  const [country, setCountry] = useState("IN");

  const columns = useMemo<DataTableProps<CatalogueItem>["columns"]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t("p02.catalogue.item"),
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            {row.original.credits !== null && (
              <span className="text-body-sm text-text-secondary">
                {t("p02.catalogue.credits", { credits: row.original.credits })}
              </span>
            )}
          </span>
        ),
      },
      {
        id: "kind",
        header: t("p02.catalogue.kind"),
        enableSorting: false,
        cell: ({ row }) => t(KIND_KEY[row.original.kind]),
      },
      {
        id: "price",
        header: t("p02.catalogue.price"),
        enableSorting: false,
        cell: ({ row }) => {
          const price = row.original.prices.find((p) => p.country === country);
          if (!price)
            return <span className="text-text-secondary">{t("p02.catalogue.notSold")}</span>;
          return (
            <span className="tabular-nums">
              {t("p02.catalogue.priceUnit", {
                price: fmt.money(price.amountMinor, price.currency),
                unit: t(UNIT_KEY[row.original.unit]),
              })}
            </span>
          );
        },
      },
      {
        id: "tax",
        header: t("p02.catalogue.tax"),
        enableSorting: false,
        cell: ({ row }) => {
          const price = row.original.prices.find((p) => p.country === country);
          return price ? t("p02.catalogue.taxRate", { rate: price.taxRatePct }) : t("p01.none");
        },
      },
      {
        id: "modules",
        header: t("p02.catalogue.modules"),
        enableSorting: false,
        cell: ({ row }) => (
          <span className="tabular-nums">{fmt.number(row.original.modules.length)}</span>
        ),
      },
    ],
    [t, fmt, country],
  );

  return (
    <div className="space-y-4">
      <Select
        label={t("p02.catalogue.country")}
        containerClassName="max-w-xs"
        value={country}
        options={countries.map((c) => ({ value: c, label: fmt.country(c) }))}
        onChange={(e) => setCountry(e.target.value)}
      />
      <DataTable
        caption={t("p02.catalogue.caption")}
        columns={columns}
        data={items}
        getRowId={(i) => i.id}
        loading={catalogue.isPending}
        error={catalogue.isError ? <EmptyState tone="error" /> : undefined}
      />
    </div>
  );
}
