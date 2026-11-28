import type { ContentAsset, ContentBlock } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { Badge, Card } from "@nexus/ui-core";
import { FileText, Globe, HelpCircle, Image, Video, type LucideIcon } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";

const BLOCK_TYPE_META: Readonly<
  Record<ContentBlock["type"], { readonly key: MessageKey; readonly icon: LucideIcon }>
> = {
  text: { key: "m31.blockType.text", icon: FileText },
  image: { key: "m31.blockType.image", icon: Image },
  video: { key: "m31.blockType.video", icon: Video },
  question: { key: "m31.blockType.question", icon: HelpCircle },
  embed: { key: "m31.blockType.embed", icon: Globe },
};

function embedHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

export interface BlockPreviewProps {
  readonly blocks: readonly ContentBlock[];
  readonly assetById?: ReadonlyMap<string, ContentAsset>;
}

/**
 * Read-only preview of a lesson's ordered blocks: text as escaped plain text, image alt text,
 * video caption counts, question id labels, and embed host names only (never an iframe).
 */
export function BlockPreview({ blocks, assetById }: BlockPreviewProps) {
  const t = useText();
  const { locale } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  return (
    <Card headingAs="h3" title={t("m31.blocks.heading")}>
      <ol className="space-y-3">
        {blocks.map((block, index) => {
          const meta = BLOCK_TYPE_META[block.type];
          const TypeIcon = meta.icon;
          const number = formatNumber(index + 1, safeLocale);
          const imageAsset = block.type === "image" ? assetById?.get(block.assetId) : undefined;
          const videoAsset = block.type === "video" ? assetById?.get(block.assetId) : undefined;

          return (
            <li
              key={`${block.type}-${index}`}
              className="space-y-2 rounded-md border border-border-default bg-bg-raised p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-body-sm font-semibold text-text-primary">
                  {t("m31.blocks.number", { number })}
                </span>
                <Badge tone="neutral">
                  <TypeIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{t(meta.key)}</span>
                </Badge>
              </div>

              {block.type === "text" && (
                <p className="whitespace-pre-wrap break-words text-body text-text-primary">
                  {block.markdown}
                </p>
              )}

              {block.type === "image" && (
                <div className="space-y-1">
                  {imageAsset && (
                    <p className="break-words text-body-sm font-medium text-text-primary">
                      {imageAsset.fileName}
                    </p>
                  )}
                  <p className="break-words text-body-sm text-text-secondary">
                    {t("m31.blocks.altText", { altText: block.altText })}
                  </p>
                </div>
              )}

              {block.type === "video" && (
                <div className="space-y-1">
                  {videoAsset && (
                    <p className="break-words text-body-sm font-medium text-text-primary">
                      {videoAsset.fileName}
                    </p>
                  )}
                  <p className="text-body-sm text-text-secondary">
                    {t("m31.blocks.captionCount", { count: block.captionAssetIds.length })}
                  </p>
                </div>
              )}

              {block.type === "question" && (
                <p className="break-words text-body-sm text-text-secondary">
                  {t("m31.blocks.questionId", { id: block.questionId })}
                </p>
              )}

              {block.type === "embed" && (
                <p className="break-words text-body-sm text-text-secondary">
                  {t("m31.blocks.embedHost", { host: embedHost(block.url) })}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
