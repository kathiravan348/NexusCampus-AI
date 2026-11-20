import {
  AiCreditSchema,
  AiSettingsSchema,
  AssistAnswerSchema,
  CapabilityTierSchema,
  LocaleSchema,
  ModuleIdSchema,
  PAGE_SIZE_MAX,
  pageSchema,
  type AiSettings,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ApiRequestError } from "../client";
import { queryKeys } from "../keys";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

/* M11 Nexus Assist (L0): mock answers only — never a model call outside the AI gateway (D14). */

export const AskResponseSchema = z.strictObject({
  answer: AssistAnswerSchema.nullable(),
  credits: AiCreditSchema,
});
export type AskResponse = z.infer<typeof AskResponseSchema>;

export const AiSettingsInputSchema = z.strictObject({
  enabled: z.boolean(),
  modules: z.record(ModuleIdSchema, z.boolean()),
  safeguardingEnabled: z.boolean(),
  defaultTier: CapabilityTierSchema,
});
export type AiSettingsInput = z.infer<typeof AiSettingsInputSchema>;

export const AskInputSchema = z.strictObject({ question: z.string(), locale: LocaleSchema });
export type AskInput = z.infer<typeof AskInputSchema>;

/** Why Assist cannot answer right now; each has its own text and next step in the UI. */
export type AssistUnavailableReason =
  "ai_off" | "not_entitled" | "offline" | "no_credits" | "minor_consent_missing";

/** Maps an ask failure to a reason, or `null` for an unexpected error. */
export function assistReason(error: unknown): AssistUnavailableReason | null {
  if (!(error instanceof ApiRequestError)) return null;
  if (error.status === 0) return "offline";
  const path = error.error.details?.[0]?.path;
  if (error.error.code === "module_disabled") return "not_entitled";
  if (path === "ai_off") return "ai_off";
  if (path === "consent") return "minor_consent_missing";
  if (path === "credits" || error.error.code === "rate_limited") return "no_credits";
  return null;
}

const CreditPage = pageSchema(AiCreditSchema);

export function useAiSettings(enabled = true) {
  return useScopedQuery(
    queryKeys.m11.settings,
    (c, signal) => c.get("/ai/settings", AiSettingsSchema, undefined, { signal }),
    enabled,
  );
}

export function useAiCredits(enabled = true) {
  return useScopedQuery(
    queryKeys.m11.credits,
    (c, signal) => c.get("/ai/credits", CreditPage, { pageSize: PAGE_SIZE_MAX }, { signal }),
    enabled,
  );
}

function useM11Invalidate() {
  const { session } = useSession();
  const qc = useQueryClient();
  return async () => {
    if (!session) return;
    await Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.m11.all(session) }),
      qc.invalidateQueries({ queryKey: queryKeys.m05.usage(session) }),
    ]);
  };
}

export function useSaveAiSettings() {
  const { client } = useServices();
  const invalidate = useM11Invalidate();
  return useMutation<AiSettings, Error, AiSettingsInput>({
    mutationFn: (body) => client.send("PUT", "/ai/settings", body, AiSettingsSchema),
    onSuccess: invalidate,
  });
}

/** Asks Assist (online only); failures carry a reason via `assistReason`. Refreshes credits and usage. */
export function useAskAssist() {
  const { client } = useServices();
  const invalidate = useM11Invalidate();
  return useMutation<AskResponse, Error, AskInput>({
    mutationFn: (body) => client.send("POST", "/assist/ask", body, AskResponseSchema),
    onSuccess: invalidate,
  });
}
