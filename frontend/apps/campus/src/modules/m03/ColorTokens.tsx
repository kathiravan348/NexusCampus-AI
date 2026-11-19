import { useText, type MessageKey } from "@nexus/i18n";
import {
  Badge,
  Button,
  Card,
  ColorField,
  COLOR_TOKENS,
  IconButton,
  isHexColor,
  type BrandPairSuggestion,
  type ColorTokenDefinition,
  type ThemeName,
} from "@nexus/ui-core";
import { Lock, RotateCcw, Sparkles } from "lucide-react";

export interface ColorTokensProps {
  readonly mode: ThemeName;
  readonly onModeChange: (mode: ThemeName) => void;
  readonly values: Readonly<Record<string, string>>;
  readonly defaults: Readonly<Record<string, string>>;
  readonly lockedTokens: ReadonlySet<string>;
  readonly brandSuggestion: BrandPairSuggestion | null;
  readonly onChange: (token: string, value: string) => void;
  readonly onReset: (token: string) => void;
  readonly onApplyBrandSuggestion: () => void;
}

interface TokenGroup {
  readonly id: string;
  readonly titleKey: MessageKey;
  readonly match: (name: string) => boolean;
}

const GROUPS: readonly TokenGroup[] = [
  {
    id: "brand",
    titleKey: "m03.colors.groupBrand",
    match: (n) => n.startsWith("brand-") || n === "on-brand",
  },
  {
    id: "surfaces",
    titleKey: "m03.colors.groupSurfaces",
    match: (n) => n.startsWith("bg-") || n.startsWith("border-"),
  },
  {
    id: "text",
    titleKey: "m03.colors.groupText",
    match: (n) => n.startsWith("text-"),
  },
  {
    id: "status",
    titleKey: "m03.colors.groupStatus",
    match: (n) =>
      n.startsWith("success") ||
      n.startsWith("danger") ||
      n.startsWith("warning") ||
      n.startsWith("info"),
  },
  {
    id: "charts",
    titleKey: "m03.colors.groupCharts",
    match: (n) => n.startsWith("chart-"),
  },
];

function tokensFor(group: TokenGroup): readonly ColorTokenDefinition[] {
  return COLOR_TOKENS.filter((token) => group.match(token.name));
}

export function ColorTokens({
  mode,
  onModeChange,
  values,
  defaults,
  lockedTokens,
  brandSuggestion,
  onChange,
  onReset,
  onApplyBrandSuggestion,
}: ColorTokensProps) {
  const t = useText();
  const modeLabel = t(mode === "light" ? "m03.mode.light" : "m03.mode.dark");

  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label={t("m03.mode.label")}
        className="inline-flex items-center gap-2 rounded-md border border-border-default bg-bg-surface p-1"
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

      {brandSuggestion && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-info-subtle p-4 text-info-text"
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-body-sm font-semibold">
              <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t("m03.colors.brandSuggestionTitle", { mode: modeLabel })}</span>
            </div>
            <p className="text-body-sm">
              {t("m03.colors.brandSuggestionBody", {
                onBrand: brandSuggestion.onBrand,
                brandText: brandSuggestion.brandPrimaryText,
              })}
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={onApplyBrandSuggestion}>
            {t("m03.colors.applyBrandSuggestion")}
          </Button>
        </div>
      )}

      {GROUPS.map((group) => {
        const items = tokensFor(group);
        return (
          <Card key={group.id} title={t(group.titleKey)}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {items.map((token) => {
                const locked = lockedTokens.has(token.name);
                const defaultValue = defaults[token.name] ?? "";
                const current = values[token.name] ?? defaultValue;
                const invalid = !locked && !isHexColor(current);
                const isModified = current.toUpperCase() !== defaultValue.toUpperCase();

                return (
                  <ColorField
                    key={`${mode}-${token.name}`}
                    id={`token-${mode}-${token.name}`}
                    label={
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="font-mono text-body-sm font-medium normal-case tracking-normal">
                          {token.name}
                        </span>
                        {locked && (
                          <Badge tone="warning" className="gap-1">
                            <Lock className="h-3 w-3" aria-hidden="true" />
                            <span>{t("m03.colors.lockedBadge")}</span>
                          </Badge>
                        )}
                      </span>
                    }
                    value={current}
                    disabled={locked}
                    readOnly={locked}
                    description={locked ? t("m03.colors.lockedReason") : undefined}
                    error={invalid ? t("m03.colors.invalidHex") : undefined}
                    pickerAriaLabel={t("m03.colors.pickerLabel", { token: token.name })}
                    onChange={(next) => onChange(token.name, next)}
                    trailingAction={
                      !locked && isModified ? (
                        <IconButton
                          type="button"
                          variant="ghost"
                          size="sm"
                          aria-label={t("m03.colors.resetToken", { token: token.name })}
                          icon={<RotateCcw className="h-4 w-4" />}
                          onClick={() => onReset(token.name)}
                        />
                      ) : undefined
                    }
                  />
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
