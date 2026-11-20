import type { AssistAnswer } from "@nexus/contracts";
import { getDirection, isPseudoLocale, SOURCE_LOCALE, useText, type MessageKey } from "@nexus/i18n";
import {
  assistReason,
  useAiSettings,
  useAskAssist,
  type AssistUnavailableReason,
} from "@nexus/services";
import { Badge, Button, Modal, Textarea, useToast } from "@nexus/ui-core";
import { Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { MODULES } from "../../app/modules";
import { useOnline } from "../../app/RouteGuard";
import { useRuntime } from "../../app/TenantRuntime";
import { AssistUnavailable } from "./AssistUnavailable";

const TIER_KEY: Readonly<Record<AssistAnswer["tier"], MessageKey>> = {
  fast: "m11.tier.fast",
  balanced: "m11.tier.balanced",
  reasoning: "m11.tier.reasoning",
  embedding: "m11.tier.embedding",
  multimodal: "m11.tier.multimodal",
};

type Entry =
  | { readonly kind: "answer"; readonly answer: AssistAnswer }
  | { readonly kind: "none"; readonly question: string; readonly id: string };

export interface AssistPanelProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

/** Nexus Assist: ask a question, get a labelled AI answer with numbered sources (A-5) or a reason why not. */
export function AssistPanel({ open, onOpenChange }: AssistPanelProps) {
  const t = useText();
  const toast = useToast();
  const { locale } = useRuntime();
  const online = useOnline();
  const settings = useAiSettings(open);
  const ask = useAskAssist();
  const [question, setQuestion] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [failure, setFailure] = useState<AssistUnavailableReason | null>(null);
  const [votes, setVotes] = useState<Record<string, "up" | "down">>({});

  const reason: AssistUnavailableReason | null = !online
    ? "offline"
    : settings.data && !settings.data.enabled
      ? "ai_off"
      : failure;

  const onAsk = async () => {
    const q = question.trim();
    if (!q) return;
    try {
      const res = await ask.mutateAsync({
        question: q,
        locale: isPseudoLocale(locale) ? SOURCE_LOCALE : locale,
      });
      setFailure(null);
      setEntries((prev) => [
        res.answer
          ? { kind: "answer", answer: res.answer }
          : { kind: "none", question: q, id: `none-${prev.length}` },
        ...prev,
      ]);
      setQuestion("");
    } catch (error) {
      const why = assistReason(error);
      if (why) setFailure(why);
      else toast.show({ tone: "danger", title: t("m11.panel.failed") });
    }
  };

  const vote = (id: string, v: "up" | "down") => setVotes((prev) => ({ ...prev, [id]: v }));

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={t("m11.panel.title")}
      description={t("m11.panel.intro")}
      className="max-sm:h-dvh max-sm:max-w-none max-sm:rounded-none"
    >
      <div className="space-y-5">
        {reason ? (
          <AssistUnavailable reason={reason} />
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void onAsk();
            }}
          >
            <Textarea
              label={t("m11.panel.question")}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={2000}
              rows={3}
            />
            <Button type="submit" loading={ask.isPending} disabled={!question.trim()}>
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              {t("m11.panel.ask")}
            </Button>
          </form>
        )}

        <ul className="space-y-4" aria-label={t("m11.panel.answers")}>
          {entries.map((entry) =>
            entry.kind === "none" ? (
              <li key={entry.id} className="rounded-lg border border-border-default p-4">
                <p className="text-body font-medium">{entry.question}</p>
                <p className="mt-1 text-body-sm text-text-secondary">{t("m11.panel.noAnswer")}</p>
              </li>
            ) : (
              <li
                key={entry.answer.id}
                className="space-y-3 rounded-lg border border-border-default bg-bg-surface p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-body font-medium text-text-primary">{entry.answer.question}</p>
                  <Badge tone="brand">
                    <Sparkles className="h-3 w-3" aria-hidden="true" />
                    {t("m11.panel.aiLabel")}
                  </Badge>
                </div>
                <p
                  lang={entry.answer.locale}
                  dir={getDirection(entry.answer.locale)}
                  className="text-body text-text-primary"
                >
                  {entry.answer.answer}
                </p>
                <div className="space-y-1">
                  <p className="text-label uppercase text-text-muted">{t("m11.panel.sources")}</p>
                  <ol className="list-decimal space-y-1 ps-5 text-body-sm">
                    {entry.answer.sources.map((s) => {
                      const mod = MODULES.find((m) => m.moduleId === s.moduleId);
                      return (
                        <li key={`${s.moduleId}-${s.recordId}`} lang={entry.answer.locale}>
                          {mod ? (
                            <Link
                              to={`/${mod.path}`}
                              className="text-brand-primary-text underline-offset-2 hover:underline"
                              onClick={() => onOpenChange(false)}
                            >
                              {s.label}
                            </Link>
                          ) : (
                            s.label
                          )}{" "}
                          <span className="font-mono text-number-sm text-text-muted">
                            ({s.moduleId})
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-body-sm text-text-muted">
                  <span>
                    {t("m11.panel.meta", {
                      tier: t(TIER_KEY[entry.answer.tier]),
                      credits: entry.answer.creditsUsed,
                    })}
                  </span>
                  <span className="flex gap-1">
                    {(["up", "down"] as const).map((v) => (
                      <Button
                        key={v}
                        size="sm"
                        variant="ghost"
                        aria-pressed={votes[entry.answer.id] === v}
                        aria-label={t(v === "up" ? "m11.panel.helpful" : "m11.panel.notHelpful")}
                        onClick={() => vote(entry.answer.id, v)}
                      >
                        {v === "up" ? (
                          <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                        )}
                      </Button>
                    ))}
                  </span>
                </div>
              </li>
            ),
          )}
        </ul>
      </div>
    </Modal>
  );
}
