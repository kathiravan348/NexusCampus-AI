import { formatNumber, useText } from "@nexus/i18n";
import {
  Badge,
  Button,
  Card,
  Input,
  Select,
  Switch,
  tenantThemeCss,
  type TenantTheme,
  type ThemeName,
} from "@nexus/ui-core";
import { useId, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";

export interface ThemePreviewProps {
  readonly theme: TenantTheme;
  readonly mode: ThemeName;
  readonly onModeChange: (mode: ThemeName) => void;
  readonly tenantName: string | null;
  readonly logoUrl: string | null;
}

export function ThemePreview({
  theme,
  mode,
  onModeChange,
  tenantName,
  logoUrl,
}: ThemePreviewProps) {
  const t = useText();
  const { locale } = useRuntime();
  const rawId = useId();
  const scopeId = rawId.replace(/[^a-zA-Z0-9_-]/g, "");
  const selector = `[data-theme-preview="${scopeId}"]`;
  const css = tenantThemeCss(theme, selector);
  const [sampleText, setSampleText] = useState("");
  const [sampleCategory, setSampleCategory] = useState("general");
  const [sampleChecked, setSampleChecked] = useState(true);

  return (
    <section aria-label={t("m03.preview.heading")} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-sans text-section-title font-semibold text-text-primary">
            {t("m03.preview.heading")}
          </h2>
          <p className="text-body-sm text-text-secondary">{t("m03.preview.subtitle")}</p>
        </div>
        <div
          role="group"
          aria-label={t("m03.mode.label")}
          className="inline-flex items-center gap-1 rounded-md border border-border-default bg-bg-surface p-1"
        >
          {(["light", "dark"] as const).map((option) => (
            <Button
              key={option}
              type="button"
              size="sm"
              variant={mode === option ? "primary" : "ghost"}
              aria-pressed={mode === option}
              onClick={() => onModeChange(option)}
            >
              {t(option === "light" ? "m03.mode.light" : "m03.mode.dark")}
            </Button>
          ))}
        </div>
      </div>

      <style data-testid="theme-preview-style">{css}</style>

      <div
        data-theme-preview={scopeId}
        data-theme={mode}
        data-testid="theme-preview-canvas"
        className="space-y-4 rounded-lg border border-border-default bg-bg-ground p-4 font-sans text-text-primary"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-bg-sidebar px-3 py-2">
          <div className="flex items-center gap-2">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={t("m03.assets.logoAlt")}
                className="h-6 max-w-24 object-contain"
              />
            )}
            <span className="text-body font-semibold text-text-primary">
              {tenantName ?? t("m03.preview.cardTitle")}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="brand">{t("common.active")}</Badge>
            <Badge tone="success">{t("common.enabled")}</Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="primary">
            {t("m03.preview.primaryAction")}
          </Button>
          <Button type="button" size="sm" variant="secondary">
            {t("m03.preview.secondaryAction")}
          </Button>
          <Button type="button" size="sm" variant="danger">
            {t("m03.preview.dangerAction")}
          </Button>
        </div>

        <Card title={t("m03.preview.cardTitle")}>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-label font-semibold uppercase text-text-muted">
                {t("m03.preview.statLabel")}
              </span>
              <span className="font-mono text-number-lg font-medium text-text-primary">
                {formatNumber(1248, locale)}
              </span>
            </div>
            <p className="text-body-sm text-text-secondary">
              {t("m03.preview.cardBody")}{" "}
              <a
                href="#preview"
                onClick={(event) => event.preventDefault()}
                className="font-medium text-brand-primary-text underline"
              >
                {t("m03.preview.sampleLink")}
              </a>
            </p>
          </div>
        </Card>

        <div className="overflow-hidden rounded-lg border border-border-default bg-bg-surface">
          <table className="w-full border-collapse text-start">
            <thead>
              <tr className="border-b border-border-default bg-bg-raised text-label uppercase text-text-muted">
                <th className="px-3 py-2 text-start font-semibold">
                  {t("m03.preview.tableColName")}
                </th>
                <th className="px-3 py-2 text-start font-semibold">
                  {t("m03.preview.tableColStatus")}
                </th>
                <th className="px-3 py-2 text-end font-semibold">
                  {t("m03.preview.tableColCount")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default text-body-sm">
              <tr>
                <td className="px-3 py-2 text-text-primary">{t("m03.preview.tableRowOne")}</td>
                <td className="px-3 py-2">
                  <Badge tone="success">{t("common.active")}</Badge>
                </td>
                <td className="px-3 py-2 text-end font-mono text-text-primary">
                  {formatNumber(42, locale)}
                </td>
              </tr>
              <tr>
                <td className="px-3 py-2 text-text-primary">{t("m03.preview.tableRowTwo")}</td>
                <td className="px-3 py-2">
                  <Badge tone="warning">{t("common.pending")}</Badge>
                </td>
                <td className="px-3 py-2 text-end font-mono text-text-primary">
                  {formatNumber(18, locale)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <Card>
          <div className="space-y-3">
            <Input
              id={`preview-input-${scopeId}`}
              label={t("m03.preview.formLabel")}
              placeholder={t("m03.preview.formPlaceholder")}
              value={sampleText}
              onChange={(event) => setSampleText(event.target.value)}
            />
            <Select
              id={`preview-select-${scopeId}`}
              label={t("m03.preview.formSelect")}
              value={sampleCategory}
              options={[
                { value: "general", label: t("m03.preview.formOptionOne") },
                { value: "priority", label: t("m03.preview.formOptionTwo") },
              ]}
              onChange={(event) => setSampleCategory(event.target.value)}
            />
            <Switch
              id={`preview-switch-${scopeId}`}
              label={t("m03.preview.formToggle")}
              checked={sampleChecked}
              onCheckedChange={setSampleChecked}
            />
          </div>
        </Card>
      </div>
    </section>
  );
}
