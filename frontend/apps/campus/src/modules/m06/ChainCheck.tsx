import type { AuditEvent } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { Button } from "@nexus/ui-core";
import { Link2, Link2Off } from "lucide-react";
import { useEffect, useState } from "react";
import { firstBrokenLink } from "./privacyShared";

export interface ChainCheckProps {
  readonly events: readonly AuditEvent[];
  /** Filters skip events, so links can only be checked on the unfiltered log. */
  readonly disabled: boolean;
}

type Result = { readonly kind: "intact" } | { readonly kind: "broken"; readonly row: number };

/** "Page check": verifies the `prevHash` links of the loaded page in the browser (E-3). */
export function ChainCheck({ events, disabled }: ChainCheckProps) {
  const t = useText();
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => setResult(null), [events]);

  const run = () => {
    const row = firstBrokenLink(events);
    setResult(row === null ? { kind: "intact" } : { kind: "broken", row });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled || events.length === 0}
        onClick={run}
      >
        {t("m06.chain.check")}
      </Button>
      {disabled && <span className="text-body-sm text-text-muted">{t("m06.chain.filtered")}</span>}
      {result && (
        <p
          role="status"
          className={
            result.kind === "intact"
              ? "flex items-center gap-2 text-body-sm font-medium text-success-text"
              : "flex items-center gap-2 text-body-sm font-medium text-danger-text"
          }
        >
          {result.kind === "intact" ? (
            <Link2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Link2Off className="h-4 w-4" aria-hidden="true" />
          )}
          {result.kind === "intact"
            ? t("m06.chain.intact", { count: events.length })
            : t("m06.chain.broken", { row: result.row })}
        </p>
      )}
    </div>
  );
}
