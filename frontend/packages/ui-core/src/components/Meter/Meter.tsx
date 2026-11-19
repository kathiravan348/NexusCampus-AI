import * as React from "react";
import { useText } from "@nexus/i18n";
import { cn } from "../../lib/cn";
import { Skeleton } from "../Skeleton/Skeleton";

export type MeterTone = "normal" | "warning" | "danger";

export interface MeterThresholds {
  /** Share of `max` (0–1+) from which the meter turns warning. Default 0.8. */
  warning: number;
  /** Share of `max` from which the meter turns danger. Default 1. */
  danger: number;
}

export interface MeterProps {
  label: React.ReactNode;
  value: number;
  /** `null` = unlimited (no bar, no tone). */
  max: number | null;
  /** Formatted value shown under the label and read by screen readers, e.g. "950 of 1,000". */
  valueText: string;
  description?: React.ReactNode;
  thresholds?: MeterThresholds;
  loading?: boolean;
  className?: string;
}

const DEFAULT_THRESHOLDS: MeterThresholds = { warning: 0.8, danger: 1 };

export function meterTone(value: number, max: number, thresholds = DEFAULT_THRESHOLDS): MeterTone {
  if (max <= 0) return value > 0 ? "danger" : "normal";
  const share = value / max;
  if (share >= thresholds.danger) return "danger";
  if (share >= thresholds.warning) return "warning";
  return "normal";
}

const FILL: Record<MeterTone, string> = {
  normal: "bg-brand-primary",
  warning: "bg-warning",
  danger: "bg-danger",
};

const TEXT: Record<MeterTone, string> = {
  normal: "text-text-secondary",
  warning: "text-warning-text",
  danger: "text-danger-text",
};

/**
 * Labelled usage meter (`role="meter"`) with normal / warning / danger tones by threshold and an
 * unlimited state. The fill grows from the inline start, so it mirrors in RTL.
 */
export function Meter({
  label,
  value,
  max,
  valueText,
  description,
  thresholds = DEFAULT_THRESHOLDS,
  loading = false,
  className,
}: MeterProps): React.ReactElement {
  const t = useText();
  const id = React.useId();

  if (loading) {
    return (
      <div className={cn("space-y-2", className)}>
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-2 w-full" />
      </div>
    );
  }

  const unlimited = max === null;
  const tone = unlimited ? "normal" : meterTone(value, max, thresholds);
  const percent = unlimited || max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100));

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span id={`${id}-label`} className="text-body font-medium text-text-primary">
          {label}
        </span>
        <span
          id={`${id}-value`}
          className={cn("font-mono text-number-sm tabular-nums", TEXT[tone])}
        >
          {unlimited ? `${valueText} · ${t("common.unlimited")}` : valueText}
        </span>
      </div>
      {unlimited ? (
        <div
          role="group"
          aria-labelledby={`${id}-label ${id}-value`}
          className="h-2 w-full rounded-pill border border-dashed border-border-default"
        />
      ) : (
        <div
          role="meter"
          aria-labelledby={`${id}-label`}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-valuenow={Math.min(value, max)}
          aria-valuetext={valueText}
          data-tone={tone}
          className="h-2 w-full overflow-hidden rounded-pill bg-bg-raised"
        >
          <div
            className={cn("h-full rounded-pill transition-[width]", FILL[tone])}
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
      {description && <p className="text-body-sm text-text-muted">{description}</p>}
    </div>
  );
}
