import type { Channel } from "@nexus/contracts";
import { useText } from "@nexus/i18n";
import { usePreferences, useSavePreferences } from "@nexus/services";
import { Button, Card, EmptyState, Input, Skeleton, Switch, useToast } from "@nexus/ui-core";
import { useEffect, useState } from "react";
import { useRuntime } from "../../app/TenantRuntime";
import { CHANNEL_KEY } from "./notifyShared";

interface Draft {
  channels: Record<string, boolean>;
  quiet: boolean;
  start: string;
  end: string;
}

/** The signed-in user's channels and quiet hours; saves offline through the outbox (L1 + own writes). */
export function PreferencesTab() {
  const t = useText();
  const toast = useToast();
  const { timeZone } = useRuntime();
  const prefs = usePreferences();
  const save = useSavePreferences();
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!prefs.data) return;
    const general = prefs.data.preferences.filter((p) => p.eventType === null);
    const channels: Record<string, boolean> = {};
    for (const c of prefs.data.channels) {
      channels[c.channel] =
        c.available && (general.find((p) => p.channel === c.channel)?.enabled ?? true);
    }
    const quiet = prefs.data.preferences.find((p) => p.quietHours !== null)?.quietHours ?? null;
    setDraft({
      channels,
      quiet: quiet !== null,
      start: quiet?.start ?? "21:00",
      end: quiet?.end ?? "07:00",
    });
  }, [prefs.data]);

  if (prefs.isError) {
    return (
      <EmptyState
        tone="error"
        title={t("m07.notifications.error")}
        action={
          <Button variant="secondary" onClick={() => void prefs.refetch()}>
            {t("common.retry")}
          </Button>
        }
      />
    );
  }
  if (!prefs.data || !draft) return <Skeleton className="h-48 w-full" />;

  const sameTimes = draft.quiet && draft.start === draft.end;

  const onSave = async () => {
    try {
      const res = await save.mutateAsync({
        channels: prefs.data.channels
          .filter((c) => c.available)
          .map((c) => ({ channel: c.channel, enabled: draft.channels[c.channel] ?? false })),
        quietHours: draft.quiet ? { start: draft.start, end: draft.end } : null,
      });
      toast.show({
        tone: "success",
        title: t(res.queued ? "m07.prefs.queued" : "m07.prefs.saved"),
      });
    } catch {
      toast.show({ tone: "danger", title: t("m07.notifications.saveFailed") });
    }
  };

  return (
    <div className="space-y-4">
      <Card title={t("m07.prefs.channels")}>
        <ul className="space-y-4">
          {prefs.data.channels.map((c) => (
            <li key={c.channel}>
              <Switch
                label={t(CHANNEL_KEY[c.channel as Channel])}
                description={c.available ? undefined : t("m07.prefs.notSetUp")}
                checked={draft.channels[c.channel] ?? false}
                disabled={!c.available}
                onCheckedChange={(v) =>
                  setDraft({ ...draft, channels: { ...draft.channels, [c.channel]: v } })
                }
              />
            </li>
          ))}
        </ul>
      </Card>
      <Card title={t("m07.prefs.quietHours")}>
        <div className="space-y-4">
          <Switch
            label={t("m07.prefs.useQuiet")}
            description={t("m07.prefs.quietHint", { timeZone })}
            checked={draft.quiet}
            onCheckedChange={(v) => setDraft({ ...draft, quiet: v })}
          />
          {draft.quiet && (
            <div className="grid max-w-md grid-cols-2 gap-4">
              <Input
                type="time"
                label={t("m07.prefs.from")}
                value={draft.start}
                onChange={(e) => setDraft({ ...draft, start: e.target.value })}
              />
              <Input
                type="time"
                label={t("m07.prefs.to")}
                value={draft.end}
                error={sameTimes ? t("m07.prefs.sameTimes") : undefined}
                onChange={(e) => setDraft({ ...draft, end: e.target.value })}
              />
            </div>
          )}
        </div>
      </Card>
      <Button loading={save.isPending} disabled={sameTimes} onClick={() => void onSave()}>
        {t("common.save")}
      </Button>
    </div>
  );
}
