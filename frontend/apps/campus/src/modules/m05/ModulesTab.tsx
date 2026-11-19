import type { Entitlement, EntitlementSource, ModuleId } from "@nexus/contracts";
import { formatDate, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { useEntitlements, useSetModuleEnabled } from "@nexus/services";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Switch,
  useToast,
  type DataTableProps,
} from "@nexus/ui-core";
import { Blocks } from "lucide-react";
import { useMemo } from "react";
import { useRuntime } from "../../app/TenantRuntime";

/** Stage 1 modules in menu order (docs/MODULES.md). */
export const STAGE1_MODULES: readonly ModuleId[] = [
  "M01",
  "M02",
  "M03",
  "M04",
  "M05",
  "M06",
  "M07",
  "M10",
  "M11",
  "M83",
];

export const MODULE_KEY: Readonly<Record<string, MessageKey>> = {
  M01: "m05.module.m01",
  M02: "m05.module.m02",
  M03: "m05.module.m03",
  M04: "m05.module.m04",
  M05: "m05.module.m05",
  M06: "m05.module.m06",
  M07: "m05.module.m07",
  M10: "m05.module.m10",
  M11: "m05.module.m11",
  M83: "m05.module.m83",
};

const SOURCE_KEY: Readonly<Record<EntitlementSource, MessageKey>> = {
  core: "m05.source.core",
  plan: "m05.source.plan",
  addon: "m05.source.addon",
  trial: "m05.source.trial",
};

interface Row {
  readonly moduleId: ModuleId;
  readonly entitlement: Entitlement | null;
}

export interface ModulesTabProps {
  readonly canManage: boolean;
  readonly online: boolean;
}

/** Every Stage 1 module with why the institution has it and a switch for optional ones. */
export function ModulesTab({ canManage, online }: ModulesTabProps) {
  const t = useText();
  const toast = useToast();
  const { locale, timeZone } = useRuntime();
  const entitlements = useEntitlements();
  const setEnabled = useSetModuleEnabled();

  const rows = useMemo<Row[]>(
    () =>
      STAGE1_MODULES.map((moduleId) => ({
        moduleId,
        entitlement: entitlements.data?.items.find((e) => e.moduleId === moduleId) ?? null,
      })),
    [entitlements.data],
  );

  const columns = useMemo<DataTableProps<Row>["columns"]>(
    () => [
      {
        id: "module",
        header: t("m05.modules.colModule"),
        enableSorting: false,
        meta: { primary: true },
        cell: ({ row }) => (
          <span className="flex flex-col">
            <span className="font-medium">{t(MODULE_KEY[row.original.moduleId]!)}</span>
            <span className="font-mono text-number-sm text-text-muted">
              {row.original.moduleId}
            </span>
          </span>
        ),
      },
      {
        id: "source",
        header: t("m05.modules.colSource"),
        enableSorting: false,
        cell: ({ row }) => {
          const e = row.original.entitlement;
          if (!e) return <Badge tone="neutral">{t("m05.modules.notInPlan")}</Badge>;
          return (
            <span className="flex flex-wrap items-center gap-2">
              <Badge
                tone={e.source === "trial" ? "warning" : e.source === "core" ? "neutral" : "brand"}
              >
                {t(SOURCE_KEY[e.source])}
              </Badge>
              {e.expiresAt && (
                <span className="font-mono text-number-sm tabular-nums text-text-secondary">
                  {t("m05.modules.expires", {
                    date: formatDate(e.expiresAt, {
                      locale: isPseudoLocale(locale) ? SOURCE_LOCALE : locale,
                      timeZone,
                    }),
                  })}
                </span>
              )}
            </span>
          );
        },
      },
      {
        id: "enabled",
        header: t("m05.modules.colEnabled"),
        enableSorting: false,
        cell: ({ row }) => {
          const e = row.original.entitlement;
          const name = t(MODULE_KEY[row.original.moduleId]!);
          const locked = !e || e.source === "core" || !canManage || !online;
          return (
            <Switch
              label={
                <span className="sr-only">{t("m05.modules.switchLabel", { module: name })}</span>
              }
              checked={e?.enabled ?? false}
              disabled={locked || setEnabled.isPending}
              onCheckedChange={(enabled) =>
                void setEnabled
                  .mutateAsync({ moduleId: row.original.moduleId, enabled })
                  .then(() =>
                    toast.show({
                      tone: "success",
                      title: t(enabled ? "m05.modules.turnedOn" : "m05.modules.turnedOff", {
                        module: name,
                      }),
                    }),
                  )
                  .catch(() => toast.show({ tone: "danger", title: t("m05.plan.saveFailed") }))
              }
            />
          );
        },
      },
    ],
    [t, locale, timeZone, canManage, online, setEnabled, toast],
  );

  return (
    <div className="space-y-4">
      <p className="text-body text-text-secondary">{t("m05.modules.intro")}</p>
      <DataTable
        caption={t("m05.modules.caption")}
        columns={columns}
        data={rows}
        getRowId={(r) => r.moduleId}
        loading={entitlements.isPending}
        error={
          entitlements.isError ? (
            <EmptyState
              tone="error"
              title={t("m05.plan.error")}
              action={
                <Button variant="secondary" onClick={() => void entitlements.refetch()}>
                  {t("common.retry")}
                </Button>
              }
            />
          ) : undefined
        }
        emptyState={
          <EmptyState icon={<Blocks className="h-6 w-6" />} title={t("m05.modules.empty")} />
        }
      />
    </div>
  );
}
