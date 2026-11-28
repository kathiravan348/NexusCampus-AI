import type {
  AccessibilityCheck,
  AccessibilityIssue,
  AccessibilityIssueCode,
} from "@nexus/contracts";
import {
  formatDateTime,
  formatNumber,
  isPseudoLocale,
  SOURCE_LOCALE,
  useText,
  type MessageKey,
} from "@nexus/i18n";
import { Badge, Card } from "@nexus/ui-core";
import { AlertCircle, AlertTriangle, CheckCircle2, Clock, type LucideIcon } from "lucide-react";
import { useRuntime } from "../../app/TenantRuntime";

const CODE_KEY: Readonly<Record<AccessibilityIssueCode, MessageKey>> = {
  missing_alt_text: "m31.a11y.code.missingAltText",
  missing_captions: "m31.a11y.code.missingCaptions",
  low_contrast: "m31.a11y.code.lowContrast",
  heading_order: "m31.a11y.code.headingOrder",
  missing_transcript: "m31.a11y.code.missingTranscript",
};

const SEVERITY_META: Readonly<
  Record<
    AccessibilityIssue["severity"],
    { readonly key: MessageKey; readonly tone: "danger" | "warning"; readonly icon: LucideIcon }
  >
> = {
  error: { key: "m31.a11y.severity.error", tone: "danger", icon: AlertCircle },
  warning: { key: "m31.a11y.severity.warning", tone: "warning", icon: AlertTriangle },
};

export interface AccessibilityReportProps {
  readonly accessibility: AccessibilityCheck | null;
}

/**
 * Displays a content item's latest accessibility check: "Not checked" when null, or the check
 * timestamp and issues ordered by severity (errors before warnings) with block/whole-item labels.
 */
export function AccessibilityReport({ accessibility }: AccessibilityReportProps) {
  const t = useText();
  const { locale, timeZone } = useRuntime();
  const safeLocale = isPseudoLocale(locale) ? SOURCE_LOCALE : locale;

  if (accessibility === null) {
    return (
      <Card headingAs="h3" title={t("m31.a11y.heading")}>
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">
              <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t("m31.a11y.notChecked")}</span>
            </Badge>
          </div>
          <p className="text-body-sm text-text-secondary">{t("m31.a11y.notCheckedHint")}</p>
        </div>
      </Card>
    );
  }

  const errors = accessibility.issues.filter((issue) => issue.severity === "error");
  const warnings = accessibility.issues.filter((issue) => issue.severity === "warning");
  const orderedIssues = [...errors, ...warnings];
  const checkedTime = formatDateTime(accessibility.checkedAt, { locale: safeLocale, timeZone });

  return (
    <Card headingAs="h3" title={t("m31.a11y.heading")}>
      <div className="space-y-3">
        <p className="text-body-sm text-text-muted">
          {t("m31.a11y.checkedAt", { time: checkedTime })}
        </p>

        {orderedIssues.length === 0 ? (
          <div>
            <Badge tone="success">
              <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />
              <span>{t("m31.a11y.passed")}</span>
            </Badge>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {errors.length > 0 && (
                <Badge tone="danger">
                  <AlertCircle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{t("m31.a11y.errorCount", { count: errors.length })}</span>
                </Badge>
              )}
              {warnings.length > 0 && (
                <Badge tone="warning">
                  <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>{t("m31.a11y.warningCount", { count: warnings.length })}</span>
                </Badge>
              )}
            </div>

            <ul className="space-y-2">
              {orderedIssues.map((issue, index) => {
                const severity = SEVERITY_META[issue.severity];
                const SeverityIcon = severity.icon;
                const location =
                  issue.blockIndex === null
                    ? t("m31.a11y.wholeItem")
                    : t("m31.blocks.number", {
                        number: formatNumber(issue.blockIndex + 1, safeLocale),
                      });

                return (
                  <li
                    key={`${issue.severity}-${issue.code}-${issue.blockIndex ?? "item"}-${index}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-default bg-bg-raised px-3 py-2"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={severity.tone}>
                        <SeverityIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>{t(severity.key)}</span>
                      </Badge>
                      <span className="text-body-sm font-medium text-text-primary">
                        {t(CODE_KEY[issue.code])}
                      </span>
                    </div>
                    <span className="text-body-sm text-text-secondary">{location}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </Card>
  );
}
