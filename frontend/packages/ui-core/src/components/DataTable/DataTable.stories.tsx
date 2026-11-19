import * as React from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ColumnDef } from "@tanstack/react-table";
import { useText } from "@nexus/i18n";
import { Badge } from "../Badge/Badge";
import { DataTable } from "./DataTable";

interface SampleRow {
  id: string;
  name: string;
  code: string;
  status: "active" | "pending" | "inactive";
  score: number;
}

const ALL_ROWS: SampleRow[] = [
  { id: "1", name: "Amina Al-Mansoor", code: "NX-101", status: "active", score: 94 },
  { id: "2", name: "Bilal Haddad", code: "NX-102", status: "pending", score: 88 },
  { id: "3", name: "Chandra Rao", code: "NX-103", status: "active", score: 97 },
  { id: "4", name: "Daria Novak", code: "NX-104", status: "inactive", score: 79 },
  { id: "5", name: "Elias Mensah", code: "NX-105", status: "active", score: 91 },
  { id: "6", name: "Fatima Zahra", code: "NX-106", status: "active", score: 95 },
];

const meta: Meta<typeof DataTable> = {
  title: "Components/DataTable",
  component: DataTable,
};

export default meta;
type Story = StoryObj<typeof DataTable>;

function useSampleColumns(): ColumnDef<SampleRow>[] {
  const t = useText();
  return React.useMemo(
    () => [
      {
        accessorKey: "name",
        header: t("common.name"),
        meta: { primary: true },
      },
      {
        accessorKey: "code",
        header: t("common.details"),
      },
      {
        accessorKey: "status",
        header: t("common.status"),
        cell: ({ row }) => {
          const status = row.original.status;
          const tone =
            status === "active" ? "success" : status === "pending" ? "warning" : "neutral";
          const label =
            status === "active"
              ? t("common.active")
              : status === "pending"
                ? t("common.pending")
                : t("common.inactive");
          return <Badge tone={tone}>{label}</Badge>;
        },
      },
      {
        accessorKey: "score",
        header: t("term.class"),
        meta: { numeric: true },
      },
    ],
    [t],
  );
}

function DefaultView() {
  const t = useText();
  const columns = useSampleColumns();
  return (
    <DataTable
      columns={columns}
      data={ALL_ROWS}
      caption={t("term.learners")}
      getRowId={(row) => row.id}
      pageSize={3}
      pageSizes={[3, 6, 10]}
    />
  );
}

function ControlledPaginationView() {
  const t = useText();
  const columns = useSampleColumns();
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(2);
  const start = (page - 1) * pageSize;
  const pageData = ALL_ROWS.slice(start, start + pageSize);

  return (
    <DataTable
      columns={columns}
      data={pageData}
      caption={t("term.learners")}
      getRowId={(row) => row.id}
      pagination={{ page, pageSize, total: ALL_ROWS.length }}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      pageSizes={[2, 4, 6]}
    />
  );
}

function LoadingView() {
  const t = useText();
  const columns = useSampleColumns();
  return <DataTable columns={columns} data={[]} caption={t("term.learners")} loading />;
}

function EmptyView() {
  const t = useText();
  const columns = useSampleColumns();
  return <DataTable columns={columns} data={[]} caption={t("term.learners")} />;
}

function ErrorView() {
  const t = useText();
  const columns = useSampleColumns();
  return (
    <DataTable columns={columns} data={[]} caption={t("term.learners")} error={t("common.error")} />
  );
}

export const Default: Story = {
  render: () => <DefaultView />,
};

export const ControlledOffsetPagination: Story = {
  render: () => <ControlledPaginationView />,
};

export const Loading: Story = {
  render: () => <LoadingView />,
};

export const Empty: Story = {
  render: () => <EmptyView />,
};

export const ErrorState: Story = {
  render: () => <ErrorView />,
};
