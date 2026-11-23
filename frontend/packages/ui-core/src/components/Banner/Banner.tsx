import * as React from "react";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "../../lib/cn";

export type BannerTone = "info" | "warning";

export interface BannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  tone?: BannerTone;
  title?: React.ReactNode;
  children?: React.ReactNode;
}

const TONE_CLASSES: Readonly<Record<BannerTone, string>> = {
  info: "bg-info-subtle text-info-text",
  warning: "bg-warning-subtle text-warning-text",
};

export const Banner = React.forwardRef<HTMLDivElement, BannerProps>(
  ({ tone = "info", title, children, className, ...props }, ref) => {
    const Icon = tone === "warning" ? TriangleAlert : Info;

    return (
      <div
        ref={ref}
        role="status"
        data-tone={tone}
        className={cn(
          "w-full flex items-start gap-2.5 px-4 py-2.5 border-b border-border-default font-sans text-body-sm",
          TONE_CLASSES[tone],
          className,
        )}
        {...props}
      >
        <Icon className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="min-w-0 flex-1 break-words">
          {title !== undefined && <p className="font-semibold">{title}</p>}
          {children !== undefined && <div>{children}</div>}
        </div>
      </div>
    );
  },
);

Banner.displayName = "Banner";
