import {
  AI_HARD_BLOCKED_MODULES,
  AI_SAFEGUARDING_MODULE,
  type CapabilityTier,
  type ModuleId,
} from "@nexus/contracts";
import { formatNumber, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import { useAiCredits, useAiSettings, useSaveAiSettings } from "@nexus/services";
import {
  Button,
  Card,
  EmptyState,
  Meter,
  Select,
  Skeleton,
  Switch,
  useToast,
} from "@nexus/ui-core";
import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";

const MODULE_KEY: Readonly<Record<string, MessageKey>> = {
  M01: "m05.module.m01",
  M02: "m05.module.m02",
  M04: "m05.module.m04",
  M06: "m05.module.m06",
  M07: "m05.module.m07",
  M10: "m05.module.m10",
  M61: "m11.module.m61",
  M62: "m11.module.m62",
  M83: "m05.module.m83",
};
const LISTED: readonly ModuleId[] = ["M01", "M02", "M04", "M06", "M07", "M10", "M61", "M62", "M83"];
const TIERS: readonly CapabilityTier[] = ["fast", "balanced", "reasoning"];
const TIER_KEY: Readonly<Record<string, MessageKey>> = {
  fast: "m11.tier.fast",
  balanced: "m11.tier.balanced",
  reasoning: "m11.tier.reasoning",
};

interface Draft {
  enabled: boolean;
  modules: Record<string, boolean>;
  safeguardingEnabled: boolean;
  defaultTier: CapabilityTier;
}

/** AI settings (M11, L0): master switch, per-module switches (health and vault always blocked), tier, credits. */
export function AiSettingsPage() {
  const t = useText();
  const toast = useToast();
  const { locale } = useRuntime();
  const online = useOnline();
  const settings = useAiSettings();
  const credits = useAiCredits();
  const save = useSaveAiSettings();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!settings.data) return;
    const { enabled, modules, safeguardingEnabled, defaultTier } = settings.data;
    setDraft({ enabled, modules: { ...modules }, safeguardingEnabled, defaultTier });
  }, [settings.data]);

  if (settings.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m11.settings.error")}
        action={
          <Button variant="secondary" onClick={() => void settings.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!settings.data || !draft) return <Skeleton className="h-64 w-full" />;

  const fmt = (n: number) => formatNumber(n, isPseudoLocale(locale) ? SOURCE_LOCALE : locale);
  const credit = credits.data?.items[0];
  const hardBlocked = (m: ModuleId) => (AI_HARD_BLOCKED_MODULES as readonly string[]).includes(m);

  const onSave = async () => {
    try {
      await save.mutateAsync(draft);
      toast.show({ tone: "success", title: t("m11.settings.saved") });
    } catch {
      toast.show({ tone: "danger", title: t("m11.settings.saveFailed") });
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-sans text-page-title font-semibold text-text-primary">
          {t("m11.nav.title")}
        </h1>
        <p className="text-body text-text-secondary">{t("m11.settings.intro")}</p>
      </header>

      <Card title={t("m11.settings.general")}>
        <div className="space-y-4">
          <Switch
            label={t("m11.settings.enabled")}
            description={t("m11.settings.enabledHint")}
            checked={draft.enabled}
            onCheckedChange={(v) => setDraft({ ...draft, enabled: v })}
          />
          <Select
            label={t("m11.settings.tier")}
            options={TIERS.map((tier) => ({ value: tier, label: t(TIER_KEY[tier]!) }))}
            value={draft.defaultTier}
            onChange={(e) => setDraft({ ...draft, defaultTier: e.target.value as CapabilityTier })}
            containerClassName="max-w-xs"
          />
          <p className="text-body-sm text-text-secondary">
            {t("m11.settings.provider", { provider: settings.data.provider.label })} ·{" "}
            {t(
              settings.data.provider.kind === "local" ? "m11.settings.local" : "m11.settings.cloud",
            )}
          </p>
          <p className="text-body-sm text-text-muted">{t("m11.settings.alwaysOn")}</p>
        </div>
      </Card>

      <Card title={t("m11.settings.modules")}>
        <ul className="space-y-4">
          {LISTED.map((m) => {
            const name = t(MODULE_KEY[m]!);
            const isSafeguarding = m === AI_SAFEGUARDING_MODULE;
            const locked = hardBlocked(m) || (isSafeguarding && !draft.safeguardingEnabled);
            return (
              <li key={m}>
                <Switch
                  label={name}
                  description={
                    hardBlocked(m)
                      ? t("m11.settings.neverRead")
                      : isSafeguarding
                        ? t("m11.settings.safeguardingNote")
                        : undefined
                  }
                  checked={!hardBlocked(m) && (draft.modules[m] ?? false)}
                  disabled={locked || !draft.enabled}
                  onCheckedChange={(v) =>
                    setDraft({ ...draft, modules: { ...draft.modules, [m]: v } })
                  }
                />
              </li>
            );
          })}
          <li>
            <Switch
              label={t("m11.settings.safeguarding")}
              description={t("m11.settings.safeguardingPia")}
              checked={draft.safeguardingEnabled}
              disabled={!draft.enabled}
              onCheckedChange={(v) =>
                setDraft({
                  ...draft,
                  safeguardingEnabled: v,
                  modules: v
                    ? draft.modules
                    : { ...draft.modules, [AI_SAFEGUARDING_MODULE]: false },
                })
              }
            />
          </li>
        </ul>
      </Card>

      <Card title={t("m11.settings.credits")}>
        {credit ? (
          <Meter
            label={t("m11.settings.creditsUsed")}
            value={credit.used}
            max={credit.granted}
            valueText={t("m11.settings.creditsValue", {
              used: fmt(credit.used),
              granted: fmt(credit.granted),
            })}
            description={t(credit.hardCap ? "m11.settings.hardCap" : "m11.settings.softCap")}
          />
        ) : (
          <Meter label={t("m11.settings.creditsUsed")} value={0} max={1} valueText="" loading />
        )}
      </Card>

      <Button onClick={() => void onSave()} loading={save.isPending} disabled={!online}>
        <Sparkles className="h-4 w-4" aria-hidden="true" />
        {t("common.save")}
      </Button>
    </div>
  );
}

export default AiSettingsPage;
