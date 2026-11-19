import {
  LocaleSchema,
  MessageKeySchema,
  PAGE_SIZE_MAX,
  TextOverrideRevisionSchema,
  TextOverrideSchema,
  pageSchema,
  type TextOverride,
} from "@nexus/contracts";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys, type KeyScope } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery } from "../query";
import { useSession } from "../session";

export const TextOverridePageSchema = pageSchema(TextOverrideSchema);
export const TextOverrideRevisionPageSchema = pageSchema(TextOverrideRevisionSchema);

export const TextOverrideDeleteResponseSchema = z.strictObject({
  deleted: z.literal(true),
  key: MessageKeySchema,
  locale: LocaleSchema,
  version: z.int().min(1),
});
export type TextOverrideDeleteResponse = z.infer<typeof TextOverrideDeleteResponseSchema>;

export const TextOverrideRollbackResponseSchema = z.strictObject({
  override: TextOverrideSchema.nullable(),
  revision: TextOverrideRevisionSchema,
});
export type TextOverrideRollbackResponse = z.infer<typeof TextOverrideRollbackResponseSchema>;

export const ImportRejectionReasonSchema = z.enum([
  "unknown_key",
  "invalid_icu",
  "empty_message",
  "locked_by_group",
  "invalid_value",
]);
export type ImportRejectionReason = z.infer<typeof ImportRejectionReasonSchema>;

export const ImportDiffEntrySchema = z.strictObject({
  key: z.string(),
  before: z.string().nullable(),
  after: z.string(),
});
export type ImportDiffEntry = z.infer<typeof ImportDiffEntrySchema>;

export const ImportRejectedEntrySchema = z.strictObject({
  key: z.string(),
  reason: ImportRejectionReasonSchema,
  message: z.string(),
});
export type ImportRejectedEntry = z.infer<typeof ImportRejectedEntrySchema>;

export const TextOverrideImportResultSchema = z.strictObject({
  dryRun: z.boolean(),
  locale: LocaleSchema,
  added: z.array(ImportDiffEntrySchema),
  changed: z.array(ImportDiffEntrySchema),
  unchanged: z.array(z.string()),
  rejected: z.array(ImportRejectedEntrySchema),
  appliedCount: z.int().min(0),
});
export type TextOverrideImportResult = z.infer<typeof TextOverrideImportResultSchema>;

export interface SaveOverrideInput {
  readonly key: string;
  readonly locale: string;
  readonly message: string;
}

export interface DeleteOverrideInput {
  readonly key: string;
  readonly locale: string;
}

export interface RollbackOverrideInput {
  readonly key: string;
  readonly locale: string;
  readonly version: number;
}

export interface ImportOverridesInput {
  readonly locale: string;
  readonly entries: Readonly<Record<string, unknown>>;
  readonly dryRun?: boolean;
}

async function invalidateM04(qc: QueryClient, session: KeyScope | null): Promise<void> {
  if (!session) return;
  const overridesPrefix = queryKeys.m04.textOverrides(session, "").slice(0, -1);
  const revisionsPrefix = queryKeys.m04.revisions(session, null, null).slice(0, -2);
  await Promise.all([
    qc.invalidateQueries({ queryKey: overridesPrefix }),
    qc.invalidateQueries({ queryKey: revisionsPrefix }),
  ]);
}

/** The tenant's text overrides for one locale, layered over the message catalogue. */
export function useTextOverrides(locale: string) {
  return useScopedQuery(
    (s) => queryKeys.m04.textOverrides(s, locale),
    (client, signal) =>
      client.get(
        "/texts/overrides",
        TextOverridePageSchema,
        { locale, pageSize: PAGE_SIZE_MAX },
        { signal },
      ),
  );
}

/** Revision history for one message key (and optional locale). */
export function useRevisions(key: string | null, locale: string | null = null) {
  return useScopedQuery(
    (s) => queryKeys.m04.revisions(s, key, locale),
    (client, signal) =>
      client.get(
        "/texts/revisions",
        TextOverrideRevisionPageSchema,
        { key, locale, pageSize: PAGE_SIZE_MAX },
        { signal },
      ),
    key !== null,
  );
}

/** Saves an institution text override and invalidates overrides so the app re-renders with new text. */
export function useSaveOverride() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useOutboxMutation<SaveOverrideInput, TextOverride>({
    moduleId: "M04",
    operation: "text.save",
    mergeRule: "lww-audited",
    send: async (client, vars, idempotencyKey) => {
      const path = `/texts/overrides/${encodeURIComponent(vars.key)}?locale=${encodeURIComponent(vars.locale)}`;
      const saved = await client.send("PUT", path, { message: vars.message }, TextOverrideSchema, {
        headers: idempotencyHeaders(idempotencyKey),
      });
      await invalidateM04(qc, session);
      return saved;
    },
  });
}

/** Removes an institution text override and invalidates overrides + revisions. */
export function useDeleteOverride() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useOutboxMutation<DeleteOverrideInput, TextOverrideDeleteResponse>({
    moduleId: "M04",
    operation: "text.delete",
    mergeRule: "lww-audited",
    send: async (client, vars, idempotencyKey) => {
      const path = `/texts/overrides/${encodeURIComponent(vars.key)}?locale=${encodeURIComponent(vars.locale)}`;
      const result = await client.send(
        "DELETE",
        path,
        undefined,
        TextOverrideDeleteResponseSchema,
        {
          headers: idempotencyHeaders(idempotencyKey),
        },
      );
      await invalidateM04(qc, session);
      return result;
    },
  });
}

/** Rolls back an institution override to an earlier version and invalidates overrides + revisions. */
export function useRollbackOverride() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useOutboxMutation<RollbackOverrideInput, TextOverrideRollbackResponse>({
    moduleId: "M04",
    operation: "text.rollback",
    mergeRule: "lww-audited",
    send: async (client, vars, idempotencyKey) => {
      const path = `/texts/overrides/${encodeURIComponent(vars.key)}/rollback?locale=${encodeURIComponent(vars.locale)}`;
      const result = await client.send(
        "POST",
        path,
        { version: vars.version },
        TextOverrideRollbackResponseSchema,
        { headers: idempotencyHeaders(idempotencyKey) },
      );
      await invalidateM04(qc, session);
      return result;
    },
  });
}

/** Runs a dry-run diff or applies a JSON import of overrides; invalidates caches on apply. */
export function useImportOverrides() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useOutboxMutation<ImportOverridesInput, TextOverrideImportResult>({
    moduleId: "M04",
    operation: "text.import",
    mergeRule: "lww-audited",
    send: async (client, vars, idempotencyKey) => {
      const result = await client.send(
        "POST",
        "/texts/overrides/import",
        { locale: vars.locale, entries: vars.entries, dryRun: vars.dryRun ?? false },
        TextOverrideImportResultSchema,
        { headers: idempotencyHeaders(idempotencyKey) },
      );
      if (!vars.dryRun) await invalidateM04(qc, session);
      return result;
    },
  });
}
