import { getDirection, useText } from "@nexus/i18n";
import { useFonts, useSaveTheme, useTheme } from "@nexus/services";
import {
  applyTenantTheme,
  Badge,
  Button,
  checkTheme,
  DEFAULT_COLORS,
  DEFAULT_RADIUS,
  EmptyState,
  isHexColor,
  Skeleton,
  Tabs,
  useToast,
  type ThemeName,
} from "@nexus/ui-core";
import { Palette, WifiOff } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { LastSynced } from "../../app/LastSynced";
import { useOnline } from "../../app/RouteGuard";
import { toTenantTheme, useRuntime } from "../../app/TenantRuntime";
import { AssetsPanel, isValidAssetInput } from "./AssetsPanel";
import { ColorTokens } from "./ColorTokens";
import { ContrastPanel } from "./ContrastPanel";
import {
  applyBrandSuggestionToDraft,
  buildPreviewTheme,
  computeBrandSuggestion,
  computeInherited,
  draftFromLayer,
  hasDraftFieldErrors,
  resetColorInDraft,
  resetRadiusInDraft,
  resolveDraftColors,
  syncKeyOf,
  toUpdatePayload,
  type ThemeDraft,
} from "./themeDraft";
import { ThemePreview } from "./ThemePreview";
import { TypographyPanel } from "./TypographyPanel";

/** Theme studio (M03, L1): colour tokens, fonts, density, radius, assets, contrast guard, live preview. */
export function ThemeStudioPage() {
  const t = useText();
  const toast = useToast();
  const { locale, mode: appMode, tenantName } = useRuntime();
  const online = useOnline();
  const themeQuery = useTheme();
  const fontsQuery = useFonts();
  const saveTheme = useSaveTheme();

  const [editMode, setEditMode] = useState<ThemeName>(appMode);
  const [draft, setDraft] = useState<ThemeDraft | null>(null);
  const [brandEdited, setBrandEdited] = useState<Record<ThemeName, boolean>>({
    light: false,
    dark: false,
  });

  const institutionLayer = useMemo(
    () => themeQuery.data?.layers.find((l) => l.scope.kind === "institution") ?? null,
    [themeQuery.data],
  );
  const inherited = useMemo(
    () => computeInherited(themeQuery.data?.layers ?? []),
    [themeQuery.data],
  );
  const syncKey = syncKeyOf(themeQuery.data);

  useEffect(() => {
    if (!institutionLayer) return;
    setDraft(draftFromLayer(institutionLayer));
    setBrandEdited({ light: false, dark: false });
  }, [syncKey, institutionLayer]);

  const { effective: effectiveColors, display: displayColors } = useMemo(
    () => resolveDraftColors(draft, inherited),
    [draft, inherited],
  );
  const contrastFailures = useMemo(() => checkTheme(effectiveColors), [effectiveColors]);
  const brandSuggestion = computeBrandSuggestion(
    draft,
    brandEdited[editMode],
    effectiveColors[editMode],
    inherited.locked,
  );
  const isDirty =
    draft !== null &&
    institutionLayer !== null &&
    JSON.stringify(draft) !== JSON.stringify(draftFromLayer(institutionLayer));
  const hasFieldErrors = hasDraftFieldErrors(draft);
  const previewTheme = useMemo(
    () => buildPreviewTheme(effectiveColors, draft, inherited),
    [effectiveColors, draft, inherited],
  );

  if (themeQuery.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-96 max-w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (themeQuery.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m03.studio.error")}
        action={
          <Button variant="secondary" onClick={() => void themeQuery.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!institutionLayer || !draft) {
    return <EmptyState icon={<Palette className="h-6 w-6" />} title={t("m03.studio.empty")} />;
  }

  const updateDraft = (fn: (prev: ThemeDraft) => ThemeDraft) =>
    setDraft((prev) => (prev ? fn(prev) : prev));
  const setColor = (mode: ThemeName, token: string, value: string) => {
    if (inherited.locked.has(token)) return;
    updateDraft((prev) => ({ ...prev, [mode]: { ...prev[mode], [token]: value } }));
    if (token === "brand-primary" && isHexColor(value)) {
      setBrandEdited((prev) => ({ ...prev, [mode]: true }));
    }
  };
  const applyBrandSuggestion = () => {
    if (!brandSuggestion) return;
    updateDraft((prev) =>
      applyBrandSuggestionToDraft(prev, editMode, brandSuggestion, inherited.locked),
    );
    setBrandEdited((prev) => ({ ...prev, [editMode]: false }));
  };
  const handleSave = async () => {
    try {
      const result = await saveTheme.mutateAsync(toUpdatePayload(draft));
      if (result.queued) {
        toast.show({ tone: "warning", title: t("m03.studio.offlineNotice") });
        return;
      }
      applyTenantTheme(toTenantTheme(result.data.effective));
      const savedInst = result.data.layers.find((l) => l.scope.kind === "institution");
      if (savedInst) setDraft(draftFromLayer(savedInst));
      setBrandEdited({ light: false, dark: false });
      toast.show({
        tone: "success",
        title: t("m03.studio.saved", {
          version: savedInst?.version ?? institutionLayer.version + 1,
        }),
      });
    } catch {
      toast.show({ tone: "danger", title: t("m03.studio.saveFailed") });
    }
  };

  const canSave =
    online && isDirty && contrastFailures.length === 0 && !hasFieldErrors && !saveTheme.isPending;
  const previewLogo =
    (isValidAssetInput(draft.logoUrl) ? draft.logoUrl.trim() : "") ||
    inherited.assets.logoUrl ||
    null;
  const discard = () => {
    setDraft(draftFromLayer(institutionLayer));
    setBrandEdited({ light: false, dark: false });
  };
  const resetToken = (token: string) =>
    !inherited.locked.has(token) &&
    updateDraft((p) => resetColorInDraft(p, inherited, editMode, token));
  const setRadius = (token: string, value: string) =>
    !inherited.locked.has(token) &&
    updateDraft((p) => ({ ...p, radius: { ...p.radius, [token]: value } }));
  const resetRadius = (token: string) =>
    !inherited.locked.has(token) && updateDraft((p) => resetRadiusInDraft(p, inherited, token));
  const editorTabs = [
    {
      value: "colors",
      label: t("m03.studio.tabColors"),
      content: (
        <ColorTokens
          mode={editMode}
          onModeChange={setEditMode}
          values={displayColors[editMode]}
          defaults={DEFAULT_COLORS[editMode]}
          lockedTokens={inherited.locked}
          brandSuggestion={brandSuggestion}
          onChange={(token, value) => setColor(editMode, token, value)}
          onReset={resetToken}
          onApplyBrandSuggestion={applyBrandSuggestion}
        />
      ),
    },
    {
      value: "typography",
      label: t("m03.studio.tabTypography"),
      content: (
        <TypographyPanel
          fonts={fontsQuery.data?.items ?? []}
          sansFont={draft.fonts.sans ?? inherited.fonts.sans}
          monoFont={draft.fonts.mono ?? inherited.fonts.mono}
          density={draft.density ?? inherited.density}
          radius={{ ...DEFAULT_RADIUS, ...inherited.radius, ...draft.radius }}
          lockedTokens={inherited.locked}
          onSansFontChange={(sans) => updateDraft((p) => ({ ...p, fonts: { ...p.fonts, sans } }))}
          onMonoFontChange={(mono) => updateDraft((p) => ({ ...p, fonts: { ...p.fonts, mono } }))}
          onDensityChange={(density) => updateDraft((p) => ({ ...p, density }))}
          onRadiusChange={setRadius}
          onRadiusReset={resetRadius}
        />
      ),
    },
    {
      value: "assets",
      label: t("m03.studio.tabAssets"),
      content: (
        <AssetsPanel
          logoUrl={draft.logoUrl}
          faviconUrl={draft.faviconUrl}
          onLogoUrlChange={(logoUrl) => updateDraft((p) => ({ ...p, logoUrl }))}
          onFaviconUrlChange={(faviconUrl) => updateDraft((p) => ({ ...p, faviconUrl }))}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-sans text-page-title font-semibold text-text-primary">
              {t("m03.nav.title")}
            </h1>
            <Badge tone="neutral">
              {t("m03.studio.version", { version: institutionLayer.version })}
            </Badge>
          </div>
          <p className="text-body text-text-secondary">{t("m03.studio.intro")}</p>
          <LastSynced updatedAt={themeQuery.dataUpdatedAt} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isDirty && (
            <Button type="button" variant="secondary" onClick={discard}>
              {t("m03.studio.discard")}
            </Button>
          )}
          <Button
            type="button"
            variant="primary"
            disabled={!canSave}
            loading={saveTheme.isPending}
            onClick={() => void handleSave()}
          >
            {t("common.save")}
          </Button>
        </div>
      </header>

      {!online && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-md border border-border-default bg-warning-subtle px-4 py-3 text-body-sm font-medium text-warning-text"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{t("m03.studio.offlineNotice")}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(340px,460px)]">
        <div className="min-w-0">
          <Tabs
            ariaLabel={t("m03.studio.tabsLabel")}
            dir={getDirection(locale)}
            defaultValue="colors"
            items={editorTabs}
          />
        </div>
        <aside className="min-w-0 space-y-4 xl:sticky xl:top-6 xl:self-start">
          <ContrastPanel
            locale={locale}
            failures={contrastFailures}
            effectiveColors={effectiveColors}
            lockedTokens={inherited.locked}
            onApplySuggestion={(mode, token, value) => setColor(mode, token, value)}
          />
          <ThemePreview
            theme={previewTheme}
            mode={editMode}
            onModeChange={setEditMode}
            tenantName={tenantName}
            logoUrl={previewLogo}
          />
        </aside>
      </div>
    </div>
  );
}

export default ThemeStudioPage;
