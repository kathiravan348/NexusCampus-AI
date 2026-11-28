import type {
  ContentAsset,
  ContentAssetKind,
  ContentItem,
  ContentKind,
  ContentStatus,
} from "@nexus/contracts";
import {
  formatDateTime,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { useContentAssets, useContentItem, useMe } from "@nexus/services";
import { Badge, Button, Card, EmptyState, Skeleton } from "@nexus/ui-core";
import {
  Archive,
  ArrowLeft,
  BookOpen,
  Captions,
  CheckCircle2,
  Eye,
  FilePenLine,
  FileText,
  Headphones,
  Image,
  Package,
  Sparkles,
  Video,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { AccessibilityReport } from "./AccessibilityReport";
import { BlockPreview } from "./BlockPreview";
import { PublishBar } from "./PublishBar";

export const CONTENT_KIND_META: Readonly<
  Record<ContentKind, { readonly key: MessageKey; readonly icon: LucideIcon }>
> = {
  lesson: { key: "m31.kind.lesson", icon: BookOpen },
  video: { key: "m31.kind.video", icon: Video },
  audio: { key: "m31.kind.audio", icon: Headphones },
  document: { key: "m31.kind.document", icon: FileText },
  scorm12: { key: "m31.kind.scorm12", icon: Package },
  scorm2004: { key: "m31.kind.scorm2004", icon: Package },
  xapi: { key: "m31.kind.xapi", icon: Package },
  cmi5: { key: "m31.kind.cmi5", icon: Package },
};

export const CONTENT_STATUS_META: Readonly<
  Record<
    ContentStatus,
    {
      readonly key: MessageKey;
      readonly icon: LucideIcon;
      readonly tone: "neutral" | "info" | "success" | "warning";
    }
  >
> = {
  draft: { key: "m31.status.draft", icon: FilePenLine, tone: "neutral" },
  in_review: { key: "m31.status.inReview", icon: Eye, tone: "info" },
  published: { key: "m31.status.published", icon: CheckCircle2, tone: "success" },
  archived: { key: "m31.status.archived", icon: Archive, tone: "warning" },
};

const ASSET_KIND_META: Readonly<
  Record<ContentAssetKind, { readonly key: MessageKey; readonly icon: LucideIcon }>
> = {
  image: { key: "m31.assetKind.image", icon: Image },
  video: { key: "m31.assetKind.video", icon: Video },
  audio: { key: "m31.assetKind.audio", icon: Headphones },
  document: { key: "m31.assetKind.document", icon: FileText },
  package: { key: "m31.assetKind.package", icon: Package },
  captions: { key: "m31.assetKind.captions", icon: Captions },
};

function referencedAssetIds(item: ContentItem): ReadonlySet<string> {
  const ids = new Set<string>(item.textTrackAssetIds);
  if (item.assetId !== null) ids.add(item.assetId);
  if (item.package !== null) ids.add(item.package.assetId);
  for (const block of item.blocks ?? []) {
    if (block.type === "image" || block.type === "video") ids.add(block.assetId);
    if (block.type === "video") {
      for (const captionId of block.captionAssetIds) ids.add(captionId);
    }
  }
  return ids;
}

function formatFileSize(bytes: number, locale: string, t: ReturnType<typeof useText>): string {
  if (bytes < 1024) {
    return t("m31.size.bytes", { value: formatNumber(bytes, locale) });
  }
  if (bytes < 1024 * 1024) {
    return t("m31.size.kb", {
      value: formatNumber(bytes / 1024, locale, { maximumFractionDigits: 1 }),
    });
  }
  return t("m31.size.mb", {
    value: formatNumber(bytes / (1024 * 1024), locale, { maximumFractionDigits: 1 }),
  });
}

function formatDuration(seconds: number, locale: string, t: ReturnType<typeof useText>): string {
  if (seconds >= 60) {
    return t("m31.item.durationMinutes", {
      minutes: formatNumber(Math.round(seconds / 60), locale),
    });
  }
  return t("m31.item.durationSeconds", { seconds: formatNumber(seconds, locale) });
}

export interface ContentItemViewProps {
  readonly item: ContentItem;
  readonly onEdit?: (item: ContentItem) => void;
  readonly onBack: () => void;
}

/**
 * Detail view of a single M31 content item: metadata, outcome count, referenced assets (without
 * URLs), lesson block previews, accessibility report, and permission-gated check/publish actions.
 */
export function ContentItemView({ item, onBack, onEdit }: ContentItemViewProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const me = useMe();
  const itemQuery = useContentItem(item.id);
  const assetsQuery = useContentAssets();

  const current = itemQuery.data ?? item;
  const kindMeta = CONTENT_KIND_META[current.kind];
  const KindIcon = kindMeta.icon;
  const statusMeta = CONTENT_STATUS_META[current.status];
  const StatusIcon = statusMeta.icon;

  const { canManage, canPublish } = useMemo(() => {
    const permissions = new Set(me.data?.permissions ?? []);
    return {
      canManage: permissions.has("m31.content.manage"),
      canPublish: permissions.has("m31.content.publish"),
    };
  }, [me.data?.permissions]);

  const { assetList, assetById } = useMemo(() => {
    const referenced = referencedAssetIds(current);
    const matching: ContentAsset[] = [];
    const byId = new Map<string, ContentAsset>();
    for (const asset of assetsQuery.data?.items ?? []) {
      if (referenced.has(asset.id)) {
        matching.push(asset);
        byId.set(asset.id, asset);
      }
    }
    return { assetList: matching, assetById: byId };
  }, [assetsQuery.data?.items, current]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 shrink-0 rtl:rotate-180" aria-hidden="true" />
          <span>{t("m31.item.back")}</span>
        </Button>
        {onEdit && canManage && current.kind === "lesson" && current.status === "draft" && (
          <Button variant="secondary" size="sm" onClick={() => onEdit(current)}>
            {t("common.edit")}
          </Button>
        )}
      </div>

      <section className="space-y-3 rounded-lg border border-border-default bg-bg-surface p-4">
        <h2 className="break-words font-sans text-section-title font-semibold text-text-primary">
          {current.title}
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="info">
            <KindIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{t(kindMeta.key)}</span>
          </Badge>
          <Badge tone={statusMeta.tone}>
            <StatusIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span>{t(statusMeta.key)}</span>
          </Badge>
          <Badge tone="neutral">
            {t("m31.item.version", { version: formatNumber(current.version, safeLocale) })}
          </Badge>
          {current.aiAssisted && (
            <Badge tone="brand">
              <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t("m31.item.aiAssisted")}</span>
            </Badge>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-3 border-t border-border-default pt-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="min-w-0">
            <dt className="text-label font-medium text-text-muted">{t("m31.item.language")}</dt>
            <dd className="text-body-sm text-text-primary">{current.language}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-label font-medium text-text-muted">{t("m31.item.outcomes")}</dt>
            <dd className="text-body-sm text-text-primary">
              {t("m31.item.outcomesCount", { count: current.outcomeIds.length })}
            </dd>
          </div>
          {current.durationSeconds !== null && (
            <div className="min-w-0">
              <dt className="text-label font-medium text-text-muted">{t("m31.item.duration")}</dt>
              <dd className="text-body-sm text-text-primary">
                {formatDuration(current.durationSeconds, safeLocale, t)}
              </dd>
            </div>
          )}
          <div className="min-w-0">
            <dt className="text-label font-medium text-text-muted">{t("m31.item.updated")}</dt>
            <dd className="text-body-sm text-text-primary">
              <time dateTime={current.updatedAt}>
                {formatDateTime(current.updatedAt, { locale: safeLocale, timeZone })}
              </time>
            </dd>
          </div>
        </dl>
      </section>

      {current.package !== null && (
        <Card headingAs="h3" title={t("m31.item.packageHeading")}>
          <div className="space-y-1 text-body-sm text-text-secondary">
            <p className="break-words">
              {t("m31.item.packageManifest", { id: current.package.manifestIdentifier })}
            </p>
            <p className="break-words">
              {t("m31.item.packageLaunchPath", { path: current.package.launchPath })}
            </p>
          </div>
        </Card>
      )}

      {current.blocks !== null && <BlockPreview blocks={current.blocks} assetById={assetById} />}

      <Card headingAs="h3" title={t("m31.assets.heading")}>
        {assetsQuery.isPending && !assetsQuery.data ? (
          <div className="space-y-2" role="status" aria-label={t("common.loading")}>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : assetsQuery.isError && !assetsQuery.data ? (
          <EmptyState
            tone="error"
            title={t("m31.assets.error")}
            action={
              <Button variant="secondary" onClick={() => void assetsQuery.refetch()}>
                {t("common.retry")}
              </Button>
            }
          />
        ) : assetList.length === 0 ? (
          <p className="text-body-sm text-text-muted">{t("m31.assets.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {assetList.map((asset) => {
              const assetKind = ASSET_KIND_META[asset.kind];
              const AssetIcon = assetKind.icon;
              return (
                <li
                  key={asset.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-default bg-bg-raised px-3 py-2"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="break-all text-body-sm font-medium text-text-primary">
                      {asset.fileName}
                    </span>
                    <Badge tone="neutral">
                      <AssetIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>{t(assetKind.key)}</span>
                    </Badge>
                  </div>
                  <span className="text-body-sm text-text-secondary">
                    {formatFileSize(asset.sizeBytes, safeLocale, t)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <AccessibilityReport accessibility={current.accessibility} />

      <PublishBar key={current.id} item={current} canManage={canManage} canPublish={canPublish} />
    </div>
  );
}
