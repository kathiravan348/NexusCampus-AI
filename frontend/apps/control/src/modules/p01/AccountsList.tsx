import type { Account, AccountStage, DeliveryModel } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import { useAccounts } from "@nexus/services/control";
import { Badge, DataTable, EmptyState, Input, Select, type DataTableProps } from "@nexus/ui-core";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useControlFormat } from "../../app/format";
import { MODEL_KEY, STAGE_KEY, STAGE_TONE, healthBand } from "./labels";

const STAGES = Object.keys(STAGE_KEY) as AccountStage[];
const MODELS = Object.keys(MODEL_KEY) as DeliveryModel[];

/** Searchable, filterable list of the customer accounts this staff member may see (P01). */
export function AccountsList() {
  const t = useControlText();
  const fmt = useControlFormat();
  const [stage, setStage] = useState<AccountStage | "">("");
  const [model, setModel] = useState<DeliveryModel | "">("");
  const [search, setSearch] = useState("");
  const accounts = useAccounts({ stage: stage || null, deliveryModel: model || null });

  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    const items = accounts.data?.items ?? [];
    return needle ? items.filter((a) => a.name.toLocaleLowerCase().includes(needle)) : items;
  }, [accounts.data, search]);

  const columns = useMemo<DataTableProps<Account>["columns"]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t("p01.col.name"),
        meta: { primary: true },
        cell: ({ row }) => (
          <Link
            to={row.original.id}
            className="font-medium text-brand-primary-text underline-offset-2 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "type",
        header: t("p01.col.type"),
        enableSorting: false,
        cell: ({ row }) => t(`m01.type.${row.original.institutionType}`),
      },
      {
        id: "model",
        header: t("p01.col.model"),
        enableSorting: false,
        cell: ({ row }) => t(MODEL_KEY[row.original.deliveryModel]),
      },
      {
        id: "stage",
        header: t("p01.col.stage"),
        enableSorting: false,
        cell: ({ row }) => (
          <Badge tone={STAGE_TONE[row.original.stage]}>{t(STAGE_KEY[row.original.stage])}</Badge>
        ),
      },
      {
        id: "learners",
        accessorKey: "learnerCount",
        header: t("p01.col.learners"),
        cell: ({ row }) => (
          <span className="tabular-nums">{fmt.number(row.original.learnerCount)}</span>
        ),
      },
      {
        id: "health",
        accessorKey: "healthScore",
        header: t("p01.col.health"),
        cell: ({ row }) => {
          const band = healthBand(row.original.healthScore);
          return (
            <Badge tone={band.tone}>
              {t("p01.health.score", { score: row.original.healthScore, label: t(band.key) })}
            </Badge>
          );
        },
      },
      {
        id: "renewal",
        accessorKey: "renewalDate",
        header: t("p01.col.renewal"),
        cell: ({ row }) =>
          row.original.renewalDate ? fmt.date(row.original.renewalDate) : t("p01.none"),
      },
    ],
    [t, fmt],
  );

  const all = { value: "", label: t("p01.list.all") };
  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p01.nav")}</h1>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Input
          label={t("p01.list.search")}
          type="search"
          value={search}
          leading={<Search className="h-4 w-4" aria-hidden="true" />}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label={t("p01.list.filterStage")}
          value={stage}
          options={[all, ...STAGES.map((s) => ({ value: s, label: t(STAGE_KEY[s]) }))]}
          onChange={(e) => setStage(e.target.value as AccountStage | "")}
        />
        <Select
          label={t("p01.list.filterModel")}
          value={model}
          options={[all, ...MODELS.map((m) => ({ value: m, label: t(MODEL_KEY[m]) }))]}
          onChange={(e) => setModel(e.target.value as DeliveryModel | "")}
        />
      </div>
      <DataTable
        caption={t("p01.list.caption")}
        columns={columns}
        data={rows}
        getRowId={(a) => a.id}
        loading={accounts.isPending}
        error={accounts.isError ? <EmptyState tone="error" /> : undefined}
        emptyState={<EmptyState description={t("p01.list.empty")} />}
      />
    </div>
  );
}
