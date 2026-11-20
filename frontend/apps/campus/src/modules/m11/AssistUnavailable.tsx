import { useText, type MessageKey } from "@nexus/i18n";
import type { AssistUnavailableReason } from "@nexus/services";
import { Ban, CloudOff, Coins, Lock, ShieldQuestion } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const REASONS: Readonly<
  Record<AssistUnavailableReason, { title: MessageKey; next: MessageKey; icon: LucideIcon }>
> = {
  ai_off: { title: "m11.unavailable.aiOffTitle", next: "m11.unavailable.aiOffNext", icon: Ban },
  not_entitled: {
    title: "m11.unavailable.notEntitledTitle",
    next: "m11.unavailable.notEntitledNext",
    icon: Lock,
  },
  offline: {
    title: "m11.unavailable.offlineTitle",
    next: "m11.unavailable.offlineNext",
    icon: CloudOff,
  },
  no_credits: {
    title: "m11.unavailable.noCreditsTitle",
    next: "m11.unavailable.noCreditsNext",
    icon: Coins,
  },
  minor_consent_missing: {
    title: "m11.unavailable.consentTitle",
    next: "m11.unavailable.consentNext",
    icon: ShieldQuestion,
  },
};

/** Why Assist cannot answer, and what to do next. The rest of the screen keeps working (ideology §2.3). */
export function AssistUnavailable({ reason }: { readonly reason: AssistUnavailableReason }) {
  const t = useText();
  const { title, next, icon: Icon } = REASONS[reason];
  return (
    <div
      role="status"
      data-reason={reason}
      className="flex items-start gap-3 rounded-lg border border-border-default bg-bg-raised p-4"
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-text-secondary" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-body font-semibold text-text-primary">{t(title)}</p>
        <p className="text-body-sm text-text-secondary">{t(next)}</p>
      </div>
    </div>
  );
}
