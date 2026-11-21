import type { DpaRecord, SecurityIncident, SubProcessor } from "@nexus/contracts";
import { useControlText } from "@nexus/i18n/control";
import {
  useCertifications,
  useDpas,
  useIncidents,
  useSubProcessors,
} from "@nexus/services/control";
import { Badge, Card, DataTable, EmptyState, Skeleton, type DataTableProps } from "@nexus/ui-core";
import { useMemo } from "react";
import { useControlFormat } from "../../app/format";
import { useAccountNames } from "../../app/names";
import { CERT_KEY, CERT_STATUS, INCIDENT_STATUS, SEVERITY } from "./labels";

/** The breach-notification clock of one incident: not a breach, notify by, notified on time, or late. */
function BreachClock({ incident }: { readonly incident: SecurityIncident }) {
  const t = useControlText();
  const fmt = useControlFormat();
  const due = incident.breachNotificationDueAt;
  if (due === null) return <span className="text-text-secondary">{t("p14.noBreach")}</span>;
  if (incident.notifiedAt === null) {
    return <Badge tone="danger">{t("p14.notifyBy", { date: fmt.date(due) })}</Badge>;
  }
  const onTime = Date.parse(incident.notifiedAt) <= Date.parse(due);
  return (
    <Badge tone={onTime ? "success" : "danger"}>
      {t(onTime ? "p14.notifiedOnTime" : "p14.notifiedLate", {
        date: fmt.date(incident.notifiedAt),
      })}
    </Badge>
  );
}

/** P14 Compliance & trust operations (read-only): certifications, incidents, sub-processors, customer DPAs. */
export default function TrustPage() {
  const t = useControlText();
  const fmt = useControlFormat();
  const names = useAccountNames();
  const certifications = useCertifications();
  const incidents = useIncidents();
  const subProcessors = useSubProcessors();
  const dpas = useDpas();

  const incidentColumns = useMemo<DataTableProps<SecurityIncident>["columns"]>(
    () => [
      {
        id: "title",
        accessorKey: "title",
        header: t("p14.col.incident"),
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{row.original.title}</span>
            <span className="text-body-sm text-text-secondary">
              {t("p14.detected", {
                date: fmt.date(row.original.detectedAt),
                accounts: row.original.affectedAccountIds
                  .map((id) => names.get(id) ?? id)
                  .join(", "),
              })}
            </span>
            {row.original.reportAiDrafted && (
              <span className="mt-1">
                <Badge tone="info">{t("p14.aiReport")}</Badge>
              </span>
            )}
          </span>
        ),
      },
      {
        id: "severity",
        header: t("p14.col.severity"),
        enableSorting: false,
        cell: ({ row }) => {
          const s = SEVERITY[row.original.severity];
          return <Badge tone={s.tone}>{t(s.key)}</Badge>;
        },
      },
      {
        id: "status",
        header: t("p14.col.status"),
        enableSorting: false,
        cell: ({ row }) => t(INCIDENT_STATUS[row.original.status]),
      },
      {
        id: "breach",
        header: t("p14.col.breach"),
        enableSorting: false,
        cell: ({ row }) => <BreachClock incident={row.original} />,
      },
    ],
    [t, fmt, names],
  );

  const subProcessorColumns = useMemo<DataTableProps<SubProcessor>["columns"]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: t("p14.col.subProcessor"),
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{row.original.name}</span>
            <span className="text-body-sm text-text-secondary">{row.original.purpose}</span>
          </span>
        ),
      },
      {
        id: "country",
        header: t("p14.col.country"),
        enableSorting: false,
        cell: ({ row }) => fmt.country(row.original.country),
      },
      {
        id: "dpa",
        header: t("p14.col.dpa"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.dpaSigned ? (
            <Badge tone="success">{t("p14.dpaSigned")}</Badge>
          ) : (
            <Badge tone="danger">{t("p14.dpaMissing")}</Badge>
          ),
      },
      {
        id: "data",
        header: t("p14.col.data"),
        enableSorting: false,
        cell: ({ row }) =>
          row.original.touchesInstitutionData ? (
            <Badge tone="warning">{t("p14.institutionData")}</Badge>
          ) : (
            t("p14.businessDataOnly")
          ),
      },
    ],
    [t, fmt],
  );

  const dpaColumns = useMemo<DataTableProps<DpaRecord>["columns"]>(
    () => [
      {
        id: "account",
        header: t("p14.col.customer"),
        meta: { primary: true },
        cell: ({ row }) => names.get(row.original.accountId) ?? row.original.accountId,
      },
      {
        id: "version",
        accessorKey: "version",
        header: t("p14.col.version"),
        enableSorting: false,
      },
      {
        id: "signed",
        header: t("p14.col.signed"),
        enableSorting: false,
        cell: ({ row }) => fmt.date(row.original.signedAt),
      },
    ],
    [t, fmt, names],
  );

  return (
    <div className="space-y-4">
      <h1 className="font-sans text-page-title font-semibold text-text-primary">{t("p14.nav")}</h1>

      <Card headingAs="h2" title={t("p14.certifications")}>
        {certifications.isPending ? (
          <Skeleton className="h-16" />
        ) : certifications.isError ? (
          <EmptyState tone="error" />
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {certifications.data.items.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-body-sm">
                <span className="font-medium">{t(CERT_KEY[c.code])}</span>
                <Badge tone={CERT_STATUS[c.status].tone}>{t(CERT_STATUS[c.status].key)}</Badge>
                {c.validUntil && (
                  <span className="text-text-secondary">
                    {t("p14.validUntil", { date: fmt.date(c.validUntil) })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section className="space-y-2">
        <h2 className="font-sans text-section-title text-text-primary">{t("p14.incidents")}</h2>
        <p className="max-w-prose text-body-sm text-text-secondary">{t("p14.breachRule")}</p>
        <DataTable
          caption={t("p14.incidents")}
          columns={incidentColumns}
          data={incidents.data?.items ?? []}
          getRowId={(i) => i.id}
          loading={incidents.isPending}
          error={incidents.isError ? <EmptyState tone="error" /> : undefined}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-sans text-section-title text-text-primary">{t("p14.subProcessors")}</h2>
        <DataTable
          caption={t("p14.subProcessors")}
          columns={subProcessorColumns}
          data={subProcessors.data?.items ?? []}
          getRowId={(s) => s.id}
          loading={subProcessors.isPending}
          error={subProcessors.isError ? <EmptyState tone="error" /> : undefined}
        />
      </section>

      <section className="space-y-2">
        <h2 className="font-sans text-section-title text-text-primary">{t("p14.dpas")}</h2>
        <DataTable
          caption={t("p14.dpas")}
          columns={dpaColumns}
          data={dpas.data?.items ?? []}
          getRowId={(d) => d.id}
          loading={dpas.isPending}
          error={dpas.isError ? <EmptyState tone="error" /> : undefined}
        />
      </section>
    </div>
  );
}
