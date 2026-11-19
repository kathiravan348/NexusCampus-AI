import { useText } from "@nexus/i18n";
import {
  Badge,
  Button,
  suggestFixForFailure,
  type ContrastFailure,
  type ThemeName,
} from "@nexus/ui-core";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

export interface ContrastPanelProps {
  readonly failures: readonly ContrastFailure[];
  readonly effectiveColors: Readonly<Record<ThemeName, Readonly<Record<string, string>>>>;
  readonly lockedTokens: ReadonlySet<string>;
  readonly onApplySuggestion: (mode: ThemeName, token: string, value: string) => void;
}

export function ContrastPanel({
  failures,
  effectiveColors,
  lockedTokens,
  onApplySuggestion,
}: ContrastPanelProps) {
  const t = useText();

  if (failures.length === 0) {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-lg border border-border-default bg-success-subtle px-4 py-3 text-body-sm font-medium text-success-text"
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{t("m03.contrast.allPass")}</span>
      </div>
    );
  }

  return (
    <section
      aria-label={t("m03.contrast.heading")}
      className="space-y-3 rounded-lg border border-danger bg-danger-subtle p-4"
    >
      <div className="flex items-start gap-2 text-danger-text">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="space-y-0.5">
          <h2 className="font-sans text-card-title font-semibold">
            {t("m03.contrast.blockingTitle", { count: failures.length })}
          </h2>
          <p className="text-body-sm">{t("m03.contrast.blockingHint")}</p>
        </div>
      </div>

      <ul className="space-y-2">
        {failures.map((failure) => {
          const fix = suggestFixForFailure(failure, effectiveColors[failure.theme], lockedTokens);
          const canFix = !lockedTokens.has(fix.token);
          const key = `${failure.theme}-${failure.fg}-${failure.bg}`;
          return (
            <li
              key={key}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border-default bg-bg-surface p-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">
                    {t(failure.theme === "light" ? "m03.mode.light" : "m03.mode.dark")}
                  </Badge>
                  <span className="font-mono text-body-sm font-medium text-text-primary">
                    {t("m03.contrast.pairLabel", { fg: failure.fg, bg: failure.bg })}
                  </span>
                </div>
                <p className="text-body-sm text-text-secondary">
                  {t("m03.contrast.ratioDetail", {
                    ratio: failure.ratio.toFixed(2),
                    minRatio: String(failure.minRatio),
                  })}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-6 w-6 shrink-0 rounded-md border border-border-strong"
                  style={{ backgroundColor: fix.value }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={!canFix}
                  onClick={() => onApplySuggestion(failure.theme, fix.token, fix.value)}
                >
                  {t("m03.contrast.useSuggestion", { color: fix.value })}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
