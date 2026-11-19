import type { Density, Font } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import {
  Badge,
  Card,
  DEFAULT_RADIUS,
  IconButton,
  Input,
  RADIUS_TOKENS,
  Select,
} from "@nexus/ui-core";
import { Lock, RotateCcw } from "lucide-react";

const PX_PATTERN = /^\d+(\.\d+)?px$/;

export interface TypographyPanelProps {
  readonly fonts: readonly Font[];
  readonly sansFont: string | null;
  readonly monoFont: string | null;
  readonly density: Density | null;
  readonly radius: Readonly<Record<string, string>>;
  readonly lockedTokens: ReadonlySet<string>;
  readonly onSansFontChange: (id: string | null) => void;
  readonly onMonoFontChange: (id: string | null) => void;
  readonly onDensityChange: (density: Density | null) => void;
  readonly onRadiusChange: (token: string, value: string) => void;
  readonly onRadiusReset: (token: string) => void;
}

export function TypographyPanel({
  fonts,
  sansFont,
  monoFont,
  density,
  radius,
  lockedTokens,
  onSansFontChange,
  onMonoFontChange,
  onDensityChange,
  onRadiusChange,
  onRadiusReset,
}: TypographyPanelProps) {
  const t = useText();
  const defaultLabel = t("m03.typography.platformDefault");

  const sansOptions = [
    { value: "", label: defaultLabel },
    ...fonts
      .filter((font) => font.roles.includes("sans"))
      .map((font) => ({ value: font.id, label: font.family })),
  ];

  const monoOptions = [
    { value: "", label: defaultLabel },
    ...fonts
      .filter((font) => font.roles.includes("mono"))
      .map((font) => ({ value: font.id, label: font.family })),
  ];

  const densityOptions = [
    { value: "", label: defaultLabel },
    { value: "compact", label: t("m03.typography.densityCompact") },
    { value: "comfortable", label: t("m03.typography.densityComfortable") },
    { value: "spacious", label: t("m03.typography.densitySpacious") },
  ];

  return (
    <div className="space-y-4">
      <Card title={t("m03.typography.fontsHeading")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            label={t("m03.typography.sansFont")}
            options={sansOptions}
            value={sansFont ?? ""}
            onChange={(event) => onSansFontChange(event.target.value || null)}
          />
          <Select
            label={t("m03.typography.monoFont")}
            options={monoOptions}
            value={monoFont ?? ""}
            onChange={(event) => onMonoFontChange(event.target.value || null)}
          />
        </div>
      </Card>

      <Card title={t("m03.typography.densityHeading")}>
        <Select
          label={t("m03.typography.densityLabel")}
          options={densityOptions}
          value={density ?? ""}
          onChange={(event) => {
            const raw = event.target.value;
            onDensityChange(raw === "" ? null : (raw as Density));
          }}
          containerClassName="max-w-xs"
        />
      </Card>

      <Card title={t("m03.typography.radiusHeading")}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {RADIUS_TOKENS.map((token) => {
            const locked = lockedTokens.has(token.name);
            const fallback = DEFAULT_RADIUS[token.name] ?? "";
            const current = radius[token.name] ?? fallback;
            const invalid = !locked && !PX_PATTERN.test(current.trim());
            const isModified = current.trim() !== fallback;

            return (
              <div key={token.name} className="flex items-start gap-2">
                <Input
                  id={`radius-${token.name}`}
                  dir="ltr"
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
                  error={invalid ? t("m03.typography.radiusInvalid") : undefined}
                  onChange={(event) => onRadiusChange(token.name, event.target.value)}
                  containerClassName="min-w-0 flex-1"
                  className="font-mono"
                />
                {!locked && isModified && (
                  <div className="pt-6">
                    <IconButton
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("m03.typography.radiusReset", { token: token.name })}
                      icon={<RotateCcw className="h-4 w-4" />}
                      onClick={() => onRadiusReset(token.name)}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
