import { getDirection, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { useLocaleSettings, useMe, useTenant, useTextOverrides } from "@nexus/services";
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  EmptyState,
  Input,
  Select,
  Skeleton,
  Tabs,
  type DataTableProps,
} from "@nexus/ui-core";
import { Search, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { localeName } from "../../app/LocaleSwitch";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { overrideLayers, useRuntime } from "../../app/TenantRuntime";
import { ImportExport } from "./ImportExport";
import { KeyEditor } from "./KeyEditor";
import { buildMessageRows, sourceBadge, type MessageRow } from "./messageRows";

/** Text & language studio (M04, L1): key search, per-locale overrides, preview, history, import/export. */
export function TextStudioPage() {
  const t = useText();
  const online = useOnline();
  const { locale: uiLocale } = useRuntime();
  const me = useMe();
  const tenant = useTenant();
  const settings = useLocaleSettings();

  const editableLocales = useMemo<readonly string[]>(() => {
    const supported = settings.data?.supportedLocales ?? [];
    return supported.length > 0 ? supported : [isPseudoLocale(uiLocale) ? SOURCE_LOCALE : uiLocale];
  }, [settings.data, uiLocale]);

  const defaultEditLocale = useMemo(() => {
    if (editableLocales.includes(uiLocale)) return uiLocale;
    const tenantDefault = settings.data?.defaultLocale;
    return tenantDefault && editableLocales.includes(tenantDefault)
      ? tenantDefault
      : (editableLocales[0] ?? SOURCE_LOCALE);
  }, [editableLocales, uiLocale, settings.data]);

  const [selectedLocale, setSelectedLocale] = useState(defaultEditLocale);
  const [search, setSearch] = useState("");
  const [overriddenOnly, setOverriddenOnly] = useState(false);
  const [editingKey, setEditingKey] = useState<MessageKey | null>(null);
  useEffect(() => {
    if (!editableLocales.includes(selectedLocale)) setSelectedLocale(defaultEditLocale);
  }, [editableLocales, selectedLocale, defaultEditLocale]);
  const overridesQuery = useTextOverrides(selectedLocale);
  const institution = tenant.data?.institutions[0] ?? null;
  const campusId =
    me.data?.assignments.find((a) => a.scope.kind === "campus")?.scope.targetId ?? null;
  const layers = useMemo(
    () => overrideLayers(overridesQuery.data?.items ?? [], institution?.id ?? null, campusId),
    [overridesQuery.data, institution?.id, campusId],
  );
  const institutionOverrides = useMemo(
    () =>
      (overridesQuery.data?.items ?? []).filter(
        (o) => o.scope.kind === "institution" && o.scope.targetId === institution?.id,
      ),
    [overridesQuery.data, institution?.id],
  );

  const allRows = useMemo<MessageRow[]>(
    () => buildMessageRows(selectedLocale, institution?.type, layers),
    [selectedLocale, institution?.type, layers],
  );

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter((row) => {
      if (overriddenOnly && !row.isOverridden) return false;
      if (!q) return true;
      return (
        row.key.toLowerCase().includes(q) || row.explanation.resolved.toLowerCase().includes(q)
      );
    });
  }, [allRows, search, overriddenOnly]);

  const overriddenCount = useMemo(() => allRows.filter((r) => r.isOverridden).length, [allRows]);
  const editingRow = useMemo(
    () => (editingKey ? (allRows.find((r) => r.key === editingKey) ?? null) : null),
    [allRows, editingKey],
  );
  const localeOptions = useMemo(
    () =>
      editableLocales.map((code) => ({
        value: code,
        label: `${localeName(code, uiLocale)} (${code})`,
      })),
    [editableLocales, uiLocale],
  );
  const selectedLocaleLabel =
    localeOptions.find((o) => o.value === selectedLocale)?.label ?? selectedLocale;
  const textDir = getDirection(selectedLocale);

  const columns = useMemo<DataTableProps<MessageRow>["columns"]>(
    () => [
      {
        accessorKey: "key",
        header: () => t("m04.studio.colKey"),
        cell: ({ row }) => (
          <code className="font-mono text-body-sm text-text-primary">{row.original.key}</code>
        ),
      },
      {
        id: "currentText",
        accessorFn: (row) => row.explanation.resolved,
        header: () => t("m04.studio.colText"),
        cell: ({ row }) => (
          <span dir={textDir} className="block max-w-md break-words text-body-sm text-text-primary">
            {row.original.explanation.resolved}
          </span>
        ),
      },
      {
        id: "source",
        accessorFn: (row) => row.explanation.winner,
        header: () => t("m04.studio.colSource"),
        cell: ({ row }) => {
          const badge = sourceBadge(row.original);
          return <Badge tone={badge.tone}>{t(badge.key)}</Badge>;
        },
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => t("m04.studio.colActions"),
        cell: ({ row }) => (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditingKey(row.original.key)}
          >
            {t(row.original.lockedByGroup ? "m04.studio.viewAction" : "common.edit")}
          </Button>
        ),
      },
    ],
    [t, textDir],
  );

  if (overridesQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (overridesQuery.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m04.studio.error")}
        action={
          <Button type="button" variant="secondary" onClick={() => void overridesQuery.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }

  const messagesContent = (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1 sm:max-w-md">
          <Input
            label={t("m04.studio.searchLabel")}
            placeholder={t("m04.studio.searchPlaceholder")}
            value={search}
            leading={<Search className="h-4 w-4" aria-hidden="true" />}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <Checkbox
            label={t("m04.studio.overriddenOnly")}
            checked={overriddenOnly}
            onCheckedChange={(checked) => setOverriddenOnly(checked === true)}
          />
          <span className="text-body-sm text-text-secondary">
            {t("m04.studio.summaryCount", {
              shown: filteredRows.length,
              total: allRows.length,
              overridden: overriddenCount,
            })}
          </span>
        </div>
      </div>
      <DataTable
        columns={columns}
        data={filteredRows}
        caption={t("m04.studio.tableCaption")}
        getRowId={(row) => row.key}
        pageSize={20}
        emptyState={
          <EmptyState
            title={t("m04.studio.noMatchesTitle")}
            description={t("m04.studio.noMatchesBody")}
          />
        }
      />
    </div>
  );

  const tabs = [
    { value: "messages", label: t("m04.studio.tabMessages"), content: messagesContent },
    {
      value: "import-export",
      label: t("m04.studio.tabImportExport"),
      content: (
        <ImportExport
          locale={selectedLocale}
          localeLabel={selectedLocaleLabel}
          institutionOverrides={institutionOverrides}
          online={online}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-sans text-page-title font-semibold text-text-primary">
            {t("m04.nav.title")}
          </h1>
          <p className="text-body text-text-secondary">{t("m04.studio.intro")}</p>
          <LastSynced updatedAt={overridesQuery.dataUpdatedAt} />
        </div>
        <div className="w-full sm:w-64">
          <Select
            label={t("m04.studio.localeLabel")}
            options={localeOptions}
            value={selectedLocale}
            onChange={(event) => setSelectedLocale(event.target.value)}
          />
        </div>
      </header>

      {!online && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-border-default bg-warning-subtle px-4 py-3 text-body-sm font-medium text-warning-text"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("m04.studio.offlineNotice")}</span>
        </div>
      )}

      <Tabs
        ariaLabel={t("m04.studio.tabsLabel")}
        dir={getDirection(uiLocale)}
        defaultValue="messages"
        items={tabs}
      />

      {editingRow && (
        <KeyEditor
          open
          onOpenChange={(next) => !next && setEditingKey(null)}
          messageKey={editingRow.key}
          locale={selectedLocale}
          localeLabel={selectedLocaleLabel}
          explanation={editingRow.explanation}
          lockedByGroup={editingRow.lockedByGroup}
          hasInstitutionOverride={editingRow.hasInstitutionOverride}
          online={online}
        />
      )}
    </div>
  );
}
export default TextStudioPage;
