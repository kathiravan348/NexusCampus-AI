import {
  ContentLessonInputSchema,
  type ContentBlock,
  type ContentItem,
  type ContentLessonInput,
} from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText } from "@nexus/i18n";
import { useContentAssets, useOutcomes } from "@nexus/services";
import { Badge, Button } from "@nexus/ui-core";
import { useId, useState, type FormEvent } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { BlockEditor, editorFieldClass } from "./BlockEditor";

const initialBlocks = {
  text: { type: "text", markdown: "" },
  image: { type: "image", assetId: "", altText: "" },
  video: { type: "video", assetId: "", captionAssetIds: [] },
  question: { type: "question", questionId: "" },
  embed: { type: "embed", url: "" },
} satisfies Record<ContentBlock["type"], ContentBlock>;
const blockTypes = Object.keys(initialBlocks) as ContentBlock["type"][];
const newRow = (block: ContentBlock) => ({ key: crypto.randomUUID(), block });

interface LessonEditorProps {
  item: ContentItem | null;
  onSave: (input: ContentLessonInput) => Promise<void>;
  onCancel: () => void;
}

export function LessonEditor({ item, onSave, onCancel }: LessonEditorProps) {
  const t = useText();
  const id = useId();
  const { locale } = useRuntime();
  const numberLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;
  const assets = useContentAssets();
  const outcomes = useOutcomes();
  const [title, setTitle] = useState(item?.title ?? "");
  const [language, setLanguage] = useState(item?.language ?? numberLocale);
  const languages = [...new Set([numberLocale, item?.language ?? numberLocale, "en", "hi", "ta"])];
  const names = new Intl.DisplayNames([numberLocale], { type: "language" });
  const [outcomeIds, setOutcomeIds] = useState<string[]>(item?.outcomeIds ?? []);
  const [rows, setRows] = useState(() => (item?.blocks ?? [initialBlocks.text]).map(newRow));
  const [type, setType] = useState<ContentBlock["type"]>("text");
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const parsed = ContentLessonInputSchema.safeParse({
    title,
    language,
    outcomeIds,
    blocks: rows.map((row) => row.block),
  });
  const invalid = (field: string) =>
    parsed.error?.issues.some((issue) => issue.path.length === 1 && issue.path[0] === field) ??
    false;
  const fieldProps = (field: string) => ({
    id: `${id}-${field}`,
    className: editorFieldClass,
    "aria-invalid": invalid(field),
    "aria-describedby": invalid(field) ? `${id}-${field}-error` : undefined,
  });
  function move(index: number, offset: number) {
    const next = [...rows];
    next.splice(index + offset, 0, ...next.splice(index, 1));
    setRows(next);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!parsed.success || busy) return;
    setFailed(false);
    setBusy(true);
    try {
      await onSave(parsed.data);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={(e) => void submit(e)} className="min-w-0 space-y-4">
      <h2 className="text-section-title font-semibold">
        {t(item ? "m31.editor.editLesson" : "m31.editor.newLesson")}
      </h2>
      {item?.aiAssisted && <Badge tone="brand">{t("m31.item.aiAssisted")}</Badge>}
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <div>
          <label htmlFor={`${id}-title`}>{t("m31.editor.title")}</label>
          <input
            {...fieldProps("title")}
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          {invalid("title") && (
            <p id={`${id}-title-error`} className="text-body-sm text-danger-text">
              {t("m31.editor.titleError")}
            </p>
          )}
        </div>
        <div>
          <label htmlFor={`${id}-language`}>{t("m31.item.language")}</label>
          <select
            {...fieldProps("language")}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            {languages.map((tag) => (
              <option key={tag} value={tag}>
                {names.of(tag) ?? tag}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-outcomeIds`}>{t("m31.item.outcomes")}</label>
          <select
            {...fieldProps("outcomeIds")}
            multiple
            value={outcomeIds}
            disabled={!outcomes.data}
            onChange={(e) =>
              setOutcomeIds(Array.from(e.target.selectedOptions, (option) => option.value))
            }
          >
            {(outcomes.data?.items ?? []).map((o) => (
              <option key={o.id} value={o.id}>
                {o.code} — {o.statement}
              </option>
            ))}
            {outcomeIds
              .filter((value) => !outcomes.data?.items.some((o) => o.id === value))
              .map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
          </select>
          {invalid("outcomeIds") && (
            <p id={`${id}-outcomeIds-error`} className="text-body-sm text-danger-text">
              {t("m31.editor.outcomeLimit")}
            </p>
          )}
        </div>
        {(assets.isError || outcomes.isError) && (
          <div role="alert">
            <p>{t("m31.editor.optionsError")}</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (assets.isError) void assets.refetch();
                if (outcomes.isError) void outcomes.refetch();
              }}
            >
              {t("common.retry")}
            </Button>
          </div>
        )}
        <ol className="space-y-3" aria-label={t("m31.blocks.heading")}>
          {rows.map(({ key, block }, index) => (
            <li key={key}>
              <fieldset
                id={`${id}-${key}`}
                tabIndex={-1}
                className="min-w-0 space-y-3 rounded-md border border-border-default bg-bg-surface p-3"
              >
                <legend className="px-1 font-semibold">
                  {t("m31.blocks.number", { number: formatNumber(index + 1, numberLocale) })}{" "}
                  {t(`m31.blockType.${block.type}`)}
                </legend>
                <BlockEditor
                  block={block}
                  assets={assets.data?.items ?? []}
                  onChange={(value) =>
                    setRows(rows.map((row) => (row.key === key ? { key, block: value } : row)))
                  }
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    {t("m31.editor.up")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    {t("m31.editor.down")}
                  </Button>
                  <Button
                    id={`${id}-remove-${key}`}
                    type="button"
                    variant="ghost"
                    aria-describedby={removing === key ? `${id}-confirm-${key}` : undefined}
                    onClick={() => {
                      if (removing !== key) {
                        setRemoving(key);
                        return;
                      }
                      const adjacent = rows[index + 1] ?? rows[index - 1];
                      document
                        .getElementById(adjacent ? `${id}-${adjacent.key}` : `${id}-blocks`)
                        ?.focus();
                      setRows(rows.filter((row) => row.key !== key));
                      setRemoving(null);
                    }}
                  >
                    {t("m31.editor.remove")}
                  </Button>
                  {removing === key && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        document.getElementById(`${id}-remove-${key}`)?.focus();
                        setRemoving(null);
                      }}
                    >
                      {t("common.cancel")}
                    </Button>
                  )}
                </div>
                {removing === key && (
                  <p role="alert" id={`${id}-confirm-${key}`}>
                    {t("m31.editor.confirmRemove")}
                  </p>
                )}
              </fieldset>
            </li>
          ))}
        </ol>
        <div>
          <label htmlFor={`${id}-blocks`}>{t("m31.editor.type")}</label>
          <select
            {...fieldProps("blocks")}
            value={type}
            onChange={(e) => setType(e.target.value as ContentBlock["type"])}
          >
            {blockTypes.map((value) => (
              <option key={value} value={value}>
                {t(`m31.blockType.${value}`)}
              </option>
            ))}
          </select>
          {invalid("blocks") && (
            <p id={`${id}-blocks-error`} className="text-body-sm text-danger-text">
              {t("m31.editor.blockRequired")}
            </p>
          )}
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={rows.length >= 200}
          onClick={() => setRows([...rows, newRow(initialBlocks[type])])}
        >
          {t("m31.editor.add")}
        </Button>
        {failed && (
          <p role="alert" className="text-body-sm text-danger-text">
            {t("m31.editor.saveError")}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={!parsed.success || busy}>
            {t("common.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {t("common.cancel")}
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
