import { cn } from "@nexus/ui-core";
import { Check, Circle, LoaderCircle, X } from "lucide-react";
import type { ReactNode } from "react";

export type JobStepStatus = "pending" | "running" | "done" | "failed";

export interface JobStep {
  readonly id: string;
  /** Already translated by the caller (ui-control components hold no texts of their own). */
  readonly label: ReactNode;
  readonly status: JobStepStatus;
}

export interface JobStepsProps {
  readonly steps: readonly JobStep[];
  /** Translated status words, read out after each step (status is never shown by colour alone). */
  readonly statusLabels: Readonly<Record<JobStepStatus, string>>;
  /** Accessible name of the list, e.g. "Steps of job prv-sr". */
  readonly ariaLabel: string;
  readonly className?: string;
}

const STYLE: Readonly<Record<JobStepStatus, { icon: ReactNode; circle: string; text: string }>> = {
  pending: {
    icon: <Circle className="h-4 w-4" aria-hidden="true" />,
    circle: "text-text-secondary border-border-default bg-bg-surface",
    text: "text-text-secondary",
  },
  running: {
    icon: <LoaderCircle className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />,
    circle: "text-info-text border-info bg-info-subtle",
    text: "text-info-text",
  },
  done: {
    icon: <Check className="h-4 w-4" aria-hidden="true" />,
    circle: "text-success-text border-success bg-success-subtle",
    text: "text-success-text",
  },
  failed: {
    icon: <X className="h-4 w-4" aria-hidden="true" />,
    circle: "text-danger-text border-danger bg-danger-subtle",
    text: "text-danger-text",
  },
};

/** Ordered steps of a long-running job (provisioning, offboarding, tenant moves) with their status. */
export function JobSteps({ steps, statusLabels, ariaLabel, className }: JobStepsProps) {
  return (
    <ol aria-label={ariaLabel} className={cn("space-y-2", className)}>
      {steps.map((step, index) => {
        const style = STYLE[step.status];
        return (
          <li key={step.id} className="flex items-center gap-3">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                style.circle,
              )}
            >
              {style.icon}
            </span>
            <span className="min-w-0 flex-1 text-body text-text-primary">
              <span className="me-2 tabular-nums text-text-secondary">{index + 1}.</span>
              {step.label}
            </span>
            <span className={cn("text-body-sm font-medium", style.text)}>
              {statusLabels[step.status]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
