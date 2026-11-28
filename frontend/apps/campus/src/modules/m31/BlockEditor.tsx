import { ContentBlockSchema, type ContentAsset, type ContentBlock } from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { useId } from "react";
import { useRuntime } from "../../app/TenantRuntime";

export const editorFieldClass =
  "block w-full min-w-0 rounded-md border border-border-default bg-bg-surface px-3 py-2 text-body text-text-primary";

interface BlockEditorProps {
  block: ContentBlock;
  assets: readonly ContentAsset[];
  onChange: (block: ContentBlock) => void;
}

export function BlockEditor({ block, assets, onChange }: BlockEditorProps) {
  const t = useText();
  const id = useId();
  const { locale } = useRuntime();
  const parsed = ContentBlockSchema.safeParse(block);
  const invalid = (field: string) =>
    parsed.error?.issues.some((issue) => issue.path[0] === field) ?? false;
  const fieldProps = (field: string, hint?: string) => ({
    id: `${id}-${field}`,
    className: editorFieldClass,
    "aria-invalid": invalid(field),
    "aria-describedby":
      [invalid(field) && `${id}-${field}-error`, hint].filter(Boolean).join(" ") || undefined,
  });
  const error = (field: string, key: MessageKey) =>
    invalid(field) && (
      <p id={`${id}-${field}-error`} className="text-body-sm text-danger-text">
        {t(key)}
      </p>
    );

  if (block.type === "text") {
    return (
      <div>
        <label htmlFor={`${id}-markdown`}>{t("m31.editor.markdown")}</label>
        <textarea
          {...fieldProps("markdown")}
          rows={4}
          maxLength={20000}
          required
          value={block.markdown}
          onChange={(e) => onChange({ ...block, markdown: e.target.value })}
        />
        {error("markdown", "m31.editor.textError")}
      </div>
    );
  }
  if (block.type === "question") {
    return (
      <div>
        <label htmlFor={`${id}-questionId`}>{t("m31.editor.questionId")}</label>
        <input
          {...fieldProps("questionId")}
          required
          value={block.questionId}
          onChange={(e) => onChange({ ...block, questionId: e.target.value })}
        />
        {error("questionId", "m31.editor.questionError")}
      </div>
    );
  }
  if (block.type === "embed") {
    const host = parsed.success ? new URL(block.url).hostname : null;
    return (
      <div>
        <label htmlFor={`${id}-url`}>{t("m31.editor.url")}</label>
        <input
          {...fieldProps("url")}
          type="url"
          required
          value={block.url}
          onChange={(e) => onChange({ ...block, url: e.target.value })}
        />
        {error("url", "m31.editor.urlError")}
        {host && <p className="break-all">{t("m31.blocks.embedHost", { host })}</p>}
      </div>
    );
  }
  const numberLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  return (
    <div className="min-w-0 space-y-3">
      <div>
        <label htmlFor={`${id}-assetId`}>
          {t(block.type === "image" ? "m31.assetKind.image" : "m31.assetKind.video")}
        </label>
        <select
          {...fieldProps("assetId")}
          required
          value={block.assetId}
          onChange={(e) => onChange({ ...block, assetId: e.target.value })}
        >
          <option value="">{t("m31.editor.chooseAsset")}</option>
          {assets
            .filter((asset) => asset.kind === block.type)
            .map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.fileName}
              </option>
            ))}
        </select>
        {error("assetId", "m31.editor.chooseAsset")}
      </div>
      {block.type === "image" ? (
        <div>
          <label htmlFor={`${id}-altText`}>{t("m31.editor.alt")}</label>
          <textarea
            {...fieldProps("altText", `${id}-count`)}
            maxLength={500}
            required
            value={block.altText}
            onChange={(e) => onChange({ ...block, altText: e.target.value })}
          />
          <p id={`${id}-count`}>
            {t("m31.editor.count", {
              count: formatNumber(block.altText.length, numberLocale),
              max: formatNumber(500, numberLocale),
            })}
          </p>
          {error("altText", "m31.editor.altError")}
        </div>
      ) : (
        <fieldset
          className="min-w-0 space-y-1"
          aria-describedby={block.captionAssetIds.length ? undefined : `${id}-warning`}
        >
          <legend>{t("m31.assetKind.captions")}</legend>
          {assets
            .filter((asset) => asset.kind === "captions")
            .map((asset) => {
              const checked = block.captionAssetIds.includes(asset.id);
              return (
                <label key={asset.id} className="flex items-center gap-2 break-all">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && block.captionAssetIds.length >= 10}
                    onChange={() =>
                      onChange({
                        ...block,
                        captionAssetIds: checked
                          ? block.captionAssetIds.filter((value) => value !== asset.id)
                          : [...block.captionAssetIds, asset.id],
                      })
                    }
                  />
                  {asset.fileName}
                </label>
              );
            })}
          {!block.captionAssetIds.length && (
            <p id={`${id}-warning`}>{t("m31.editor.captionWarning")}</p>
          )}
        </fieldset>
      )}
    </div>
  );
}
