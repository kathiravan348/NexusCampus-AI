import type { TextOverride } from "@nexus/contracts";
import { getDirection, useText, type MessageKey } from "@nexus/i18n";
import {
  useImportOverrides,
  type ImportRejectionReason,
  type TextOverrideImportResult,
} from "@nexus/services";
import { Badge, Button, Card, Textarea, useToast } from "@nexus/ui-core";
import { Download, Upload } from "lucide-react";
import { useState, type ChangeEvent } from "react";

export interface ImportExportProps {
  readonly locale: string;
  readonly localeLabel: string;
  readonly institutionOverrides: readonly TextOverride[];
  readonly online: boolean;
}

const REASON_KEYS: Readonly<Record<ImportRejectionReason, MessageKey>> = {
  unknown_key: "m04.io.reasonUnknownKey",
  invalid_icu: "m04.io.reasonInvalidIcu",
  empty_message: "m04.io.reasonEmptyMessage",
  locked_by_group: "m04.io.reasonLockedByGroup",
  invalid_value: "m04.io.reasonInvalidValue",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Accepts either `{ locale?, entries: { key: text } }` (our export format) or flat `{ key: text }`. */
export function parseImportEntries(raw: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isPlainObject(parsed)) return null;
    if ("entries" in parsed && isPlainObject(parsed["entries"])) return parsed["entries"];
    return parsed;
  } catch {
    return null;
  }
}

/** Export current locale's institution overrides as JSON; import JSON with dry-run diff and apply. */
export function ImportExport({
  locale,
  localeLabel,
  institutionOverrides,
  online,
}: ImportExportProps) {
  const t = useText();
  const toast = useToast();
  const importMutation = useImportOverrides();

  const [rawJson, setRawJson] = useState("");
  const [parseError, setParseError] = useState<string | undefined>(undefined);
  const [diffResult, setDiffResult] = useState<TextOverrideImportResult | null>(null);
  const diff = diffResult?.locale === locale ? diffResult : null;
  const textDir = getDirection(locale);

  const handleExport = () => {
    const entries = Object.fromEntries(
      [...institutionOverrides]
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((o) => [o.key, o.message]),
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ locale, entries }, null, 2)], { type: "application/json" }),
    );
    const link = Object.assign(document.createElement("a"), {
      href: url,
      download: `texts-${locale}.json`,
    });
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast.show({ tone: "success", title: t("m04.io.exportedToast", { locale: localeLabel }) });
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setRawJson(typeof reader.result === "string" ? reader.result : "");
      setParseError(undefined);
      setDiffResult(null);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    const entries = parseImportEntries(rawJson);
    if (!entries) {
      setParseError(t("m04.io.jsonInvalid"));
      setDiffResult(null);
      return;
    }
    setParseError(undefined);
    try {
      const result = await importMutation.mutateAsync({ locale, entries, dryRun: true });
      if (result.queued) {
        toast.show({ tone: "warning", title: t("m04.studio.offlineNotice") });
        return;
      }
      setDiffResult(result.data);
    } catch {
      toast.show({ tone: "danger", title: t("m04.io.previewFailedToast") });
    }
  };

  const validChangesCount = diff ? diff.added.length + diff.changed.length : 0;

  const handleApply = async () => {
    if (!diff || validChangesCount === 0 || !online) return;
    const entries = Object.fromEntries(
      [...diff.added, ...diff.changed].map((item) => [item.key, item.after]),
    );
    try {
      const result = await importMutation.mutateAsync({ locale, entries, dryRun: false });
      if (result.queued) {
        toast.show({ tone: "warning", title: t("m04.studio.offlineNotice") });
        return;
      }
      toast.show({
        tone: "success",
        title: t("m04.io.appliedToast", { count: result.data.appliedCount }),
      });
      setRawJson("");
      setDiffResult(null);
    } catch {
      toast.show({ tone: "danger", title: t("m04.io.applyFailedToast") });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card title={t("m04.io.exportHeading")}>
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            {t("m04.io.exportDescription", { locale: localeLabel })}
          </p>
          <p className="text-body-sm text-text-secondary">
            {institutionOverrides.length > 0
              ? t("m04.io.exportCount", { count: institutionOverrides.length })
              : t("m04.io.exportEmpty", { locale: localeLabel })}
          </p>
          <Button type="button" variant="secondary" onClick={handleExport}>
            <Download className="h-4 w-4" aria-hidden="true" />
            <span>{t("m04.io.exportButton")}</span>
          </Button>
        </div>
      </Card>

      <Card title={t("m04.io.importHeading")}>
        <div className="space-y-4">
          <p className="text-body-sm text-text-secondary">
            {t("m04.io.importDescription", { locale: localeLabel })}
          </p>
          <div className="space-y-1.5">
            <label
              htmlFor="m04-import-file"
              className="block font-sans text-body-sm font-medium text-text-primary"
            >
              {t("m04.io.fileLabel")}
            </label>
            <input
              id="m04-import-file"
              type="file"
              accept=".json,application/json"
              onChange={handleFileChange}
              className="block w-full text-body-sm text-text-secondary file:me-3 file:rounded-md file:border file:border-border-strong file:bg-bg-surface file:px-3 file:py-1.5 file:font-sans file:text-body-sm file:font-medium file:text-text-primary hover:file:bg-bg-raised"
            />
          </div>

          <Textarea
            label={t("m04.io.jsonLabel")}
            placeholder={t("m04.io.jsonPlaceholder")}
            rows={5}
            value={rawJson}
            error={parseError}
            className="font-mono text-body-sm"
            onChange={(event) => {
              setRawJson(event.target.value);
              setParseError(undefined);
              setDiffResult(null);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={!online || rawJson.trim().length === 0 || importMutation.isPending}
              loading={importMutation.isPending}
              onClick={() => void handlePreview()}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              <span>{t("m04.io.previewButton")}</span>
            </Button>
            <Button
              type="button"
              variant="primary"
              disabled={!online || validChangesCount === 0 || importMutation.isPending}
              onClick={() => void handleApply()}
            >
              {t("m04.io.applyButton")}
            </Button>
          </div>

          {diff && (
            <section
              aria-labelledby="m04-diff-heading"
              className="space-y-3 rounded-md border border-border-default bg-bg-raised p-3"
            >
              <h3
                id="m04-diff-heading"
                className="font-sans text-body-sm font-semibold text-text-primary"
              >
                {t("m04.io.diffHeading")}
              </h3>
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">{t("m04.io.addedCount", { count: diff.added.length })}</Badge>
                <Badge tone="brand">
                  {t("m04.io.changedCount", { count: diff.changed.length })}
                </Badge>
                <Badge tone="neutral">
                  {t("m04.io.unchangedCount", { count: diff.unchanged.length })}
                </Badge>
                <Badge tone="danger">
                  {t("m04.io.rejectedCount", { count: diff.rejected.length })}
                </Badge>
              </div>

              {diff.added.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-body-sm font-semibold text-text-secondary">
                    {t("m04.io.addedHeading")}
                  </h4>
                  <ul className="space-y-1 text-body-sm">
                    {diff.added.map((row) => (
                      <li key={row.key} className="flex flex-wrap items-baseline gap-2">
                        <code className="font-mono text-body-sm text-text-primary">{row.key}</code>
                        <span dir={textDir} className="text-success-text">
                          {row.after}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {diff.changed.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-body-sm font-semibold text-text-secondary">
                    {t("m04.io.changedHeading")}
                  </h4>
                  <ul className="space-y-1 text-body-sm">
                    {diff.changed.map((row) => (
                      <li key={row.key} className="flex flex-wrap items-baseline gap-2">
                        <code className="font-mono text-body-sm text-text-primary">{row.key}</code>
                        <span dir={textDir} className="text-text-muted line-through">
                          {row.before}
                        </span>
                        <span dir={textDir} className="font-medium text-text-primary">
                          {row.after}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {diff.rejected.length > 0 && (
                <div className="space-y-1">
                  <h4 className="text-body-sm font-semibold text-danger-text">
                    {t("m04.io.rejectedHeading")}
                  </h4>
                  <ul className="space-y-1 text-body-sm">
                    {diff.rejected.map((row) => (
                      <li key={row.key} className="flex flex-wrap items-baseline gap-2">
                        <code className="font-mono text-body-sm text-text-primary">{row.key}</code>
                        <span className="text-danger-text">{t(REASON_KEYS[row.reason])}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {validChangesCount === 0 && (
                <p className="text-body-sm text-text-muted">{t("m04.io.noChanges")}</p>
              )}
            </section>
          )}
        </div>
      </Card>
    </div>
  );
}
