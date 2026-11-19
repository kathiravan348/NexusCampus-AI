import { AssetUrlSchema } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { Card, Input } from "@nexus/ui-core";
import { ImageOff } from "lucide-react";

export interface AssetsPanelProps {
  readonly logoUrl: string;
  readonly faviconUrl: string;
  readonly onLogoUrlChange: (value: string) => void;
  readonly onFaviconUrlChange: (value: string) => void;
}

export function isValidAssetInput(value: string): boolean {
  const trimmed = value.trim();
  return trimmed === "" || AssetUrlSchema.safeParse(trimmed).success;
}

export function AssetsPanel({
  logoUrl,
  faviconUrl,
  onLogoUrlChange,
  onFaviconUrlChange,
}: AssetsPanelProps) {
  const t = useText();
  const logoTrimmed = logoUrl.trim();
  const faviconTrimmed = faviconUrl.trim();
  const logoValid = isValidAssetInput(logoUrl);
  const faviconValid = isValidAssetInput(faviconUrl);

  return (
    <Card title={t("m03.assets.heading")}>
      <div className="space-y-6">
        <div className="space-y-3">
          <Input
            id="asset-logo-url"
            dir="ltr"
            label={t("m03.assets.logoUrl")}
            description={t("m03.assets.logoHint")}
            error={!logoValid ? t("m03.assets.invalidUrl") : undefined}
            value={logoUrl}
            onChange={(event) => onLogoUrlChange(event.target.value)}
          />
          <div className="flex min-h-20 items-center justify-center rounded-md border border-border-default bg-bg-raised p-4">
            {logoTrimmed && logoValid ? (
              <img
                src={logoTrimmed}
                alt={t("m03.assets.logoAlt")}
                className="max-h-12 max-w-full object-contain"
              />
            ) : (
              <span className="inline-flex items-center gap-2 text-body-sm text-text-muted">
                <ImageOff className="h-4 w-4" aria-hidden="true" />
                <span>{t("m03.assets.noPreview")}</span>
              </span>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Input
            id="asset-favicon-url"
            dir="ltr"
            label={t("m03.assets.faviconUrl")}
            description={t("m03.assets.faviconHint")}
            error={!faviconValid ? t("m03.assets.invalidUrl") : undefined}
            value={faviconUrl}
            onChange={(event) => onFaviconUrlChange(event.target.value)}
          />
          <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border-default bg-bg-raised p-2">
            {faviconTrimmed && faviconValid ? (
              <img
                src={faviconTrimmed}
                alt={t("m03.assets.faviconAlt")}
                className="h-8 w-8 object-contain"
              />
            ) : (
              <ImageOff
                className="h-5 w-5 text-text-muted"
                aria-label={t("m03.assets.noPreview")}
              />
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
