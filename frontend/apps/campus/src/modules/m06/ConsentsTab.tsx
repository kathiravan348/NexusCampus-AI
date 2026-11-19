import type { Consent, ConsentPurpose, ConsentStatus } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { useConsents } from "@nexus/services";
import { Badge, Button, DataTable, EmptyState, Select, type DataTableProps } from "@nexus/ui-core";
import { HeartHandshake } from "lucide-react";
import { useMemo, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import {
  CONSENT_STATUS_KEY,
  CONSENT_TONE,
  day,
  METHOD_KEY,
  PURPOSE_KEY,
  useNames,
} from "./privacyShared";

const PURPOSES = Object.keys(PURPOSE_KEY) as ConsentPurpose[];
const STATUSES = Object.keys(CONSENT_STATUS_KEY) as ConsentStatus[];

/** Consent records per person and purpose, filterable by purpose and status (G-6). */
export function ConsentsTab({ canSeeUsers }: { readonly canSeeUsers: boolean }) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const consents = useConsents();
  const names = useNames(canSeeUsers);
  const [purpose, setPurpose] = useState<ConsentPurpose | "">("");
  const [status, setStatus] = useState<ConsentStatus | "">("");

  const rows = (consents.data?.items ?? []).filter(
    (c) => (purpose === "" || c.purpose === purpose) && (status === "" || c.status === status),
  );

  const columns = useMemo<DataTableProps<Consent>["columns"]>(
    () => [
      {
        id: "person",
        accessorFn: (c) => names.person.get(c.personId) ?? c.personId,
        header: t("m06.consents.colPerson"),
        meta: { primary: true },
      },
      {
        id: "purpose",
        accessorFn: (c) => c.purpose,
        header: t("m06.consents.colPurpose"),
        cell: ({ row }) => t(PURPOSE_KEY[row.original.purpose]),
      },
      {
        id: "status",
        accessorFn: (c) => c.status,
        header: t("m06.consents.colStatus"),
        cell: ({ row }) => (
          <Badge tone={CONSENT_TONE[row.original.status]}>
            {t(CONSENT_STATUS_KEY[row.original.status])}
          </Badge>
        ),
      },
      {
        id: "givenBy",
        header: t("m06.consents.colGivenBy"),
        enableSorting: false,
        cell: ({ row }) => {
          const by = row.original.givenByPersonId;
          return by ? (names.person.get(by) ?? by) : t("m06.consents.self");
        },
      },
      {
        id: "method",
        header: t("m06.consents.colMethod"),
        enableSorting: false,
        cell: ({ row }) => t(METHOD_KEY[row.original.method]),
      },
      {
        id: "recorded",
        accessorFn: (c) => c.recordedAt,
        header: t("m06.consents.colRecorded"),
        cell: ({ row }) => (
          <span className="font-mono text-number-sm tabular-nums">
            {day(row.original.recordedAt, locale, timeZone)}
            {row.original.withdrawnAt && ` → ${day(row.original.withdrawnAt, locale, timeZone)}`}
          </span>
        ),
      },
    ],
    [t, names, locale, timeZone],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select
          label={t("m06.consents.filterPurpose")}
          options={[
            { value: "", label: t("m06.consents.allPurposes") },
            ...PURPOSES.map((p) => ({ value: p, label: t(PURPOSE_KEY[p]) })),
          ]}
          value={purpose}
          onChange={(e) => setPurpose(e.target.value as ConsentPurpose | "")}
          containerClassName="w-full sm:w-56"
        />
        <Select
          label={t("m06.consents.filterStatus")}
          options={[
            { value: "", label: t("m06.consents.allStatuses") },
            ...STATUSES.map((s) => ({ value: s, label: t(CONSENT_STATUS_KEY[s]) })),
          ]}
          value={status}
          onChange={(e) => setStatus(e.target.value as ConsentStatus | "")}
          containerClassName="w-full sm:w-48"
        />
      </div>
      <DataTable
        caption={t("m06.consents.caption")}
        columns={columns}
        data={rows}
        getRowId={(c) => c.id}
        loading={consents.isPending}
        error={
          consents.isError ? (
            <EmptyState
              tone="error"
              title={t("m06.privacy.error")}
              action={
                <Button variant="secondary" onClick={() => void consents.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState
            icon={<HeartHandshake className="h-6 w-6" />}
            title={t("m06.consents.empty")}
          />
        }
      />
    </div>
  );
}
