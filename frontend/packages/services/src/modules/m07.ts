import {
  ChannelSchema,
  LocaleSchema,
  NotificationDeliverySchema,
  NotificationPreferenceSchema,
  NotificationTemplateSchema,
  PAGE_SIZE_MAX,
  TimeOfDaySchema,
  pageSchema,
  type Channel,
  type DeliveryStatus,
  type NotificationTemplate,
} from "@nexus/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { queryKeys } from "../keys";
import { idempotencyHeaders, useOutboxMutation } from "../mutation";
import { useScopedQuery, useServices } from "../query";
import { useSession } from "../session";

/*
 * M07 notifications (L1). `PreferencesResponseSchema` is prototype-only (not a contract): the mock adds which
 * channels the institution has set up so unavailable channels show disabled, never broken (NEX-024).
 */

export const PreferencesResponseSchema = z.strictObject({
  preferences: z.array(NotificationPreferenceSchema),
  channels: z.array(z.strictObject({ channel: ChannelSchema, available: z.boolean() })),
});
export type PreferencesResponse = z.infer<typeof PreferencesResponseSchema>;

export const PreferencesInputSchema = z.strictObject({
  channels: z.array(z.strictObject({ channel: ChannelSchema, enabled: z.boolean() })),
  quietHours: z.strictObject({ start: TimeOfDaySchema, end: TimeOfDaySchema }).nullable(),
});
export type PreferencesInput = z.infer<typeof PreferencesInputSchema>;

export const TemplateInputSchema = z.strictObject({
  subject: z.string().trim().min(1).max(300).nullable(),
  body: z.string().trim().min(1).max(10000),
  enabled: z.boolean(),
});
export type TemplateInput = z.infer<typeof TemplateInputSchema>;

export interface NewTemplateInput extends TemplateInput {
  readonly eventType: string;
  readonly channel: Channel;
  readonly locale: z.infer<typeof LocaleSchema>;
}

export interface DeliveryFilters {
  readonly status?: DeliveryStatus;
  readonly channel?: Channel;
}

const TemplatePage = pageSchema(NotificationTemplateSchema);
export const DeliveryPageSchema = pageSchema(NotificationDeliverySchema);

export function useTemplates(enabled = true) {
  return useScopedQuery(
    queryKeys.m07.templates,
    (c, signal) =>
      c.get("/notification-templates", TemplatePage, { pageSize: PAGE_SIZE_MAX }, { signal }),
    enabled,
  );
}

export function useDeliveries(
  page: number,
  pageSize: number,
  filters: DeliveryFilters,
  enabled = true,
) {
  return useScopedQuery(
    (s) => queryKeys.m07.deliveries(s, page, pageSize, filters),
    (c, signal) =>
      c.get(
        "/notification-deliveries",
        DeliveryPageSchema,
        { ...filters, page, pageSize },
        { signal },
      ),
    enabled,
  );
}

export function usePreferences() {
  return useScopedQuery(queryKeys.m07.preferences, (c, signal) =>
    c.get("/notification-preferences", PreferencesResponseSchema, undefined, { signal }),
  );
}

/** Updates (`id`) or adds a locale version of a template; online only. */
export function useSaveTemplate() {
  const { client } = useServices();
  const { session } = useSession();
  const qc = useQueryClient();
  return useMutation<
    NotificationTemplate,
    Error,
    { id: string; data: TemplateInput } | { id?: undefined; data: NewTemplateInput }
  >({
    mutationFn: ({ id, data }) =>
      id
        ? client.send(
            "PUT",
            `/notification-templates/${encodeURIComponent(id)}`,
            data,
            NotificationTemplateSchema,
          )
        : client.send("POST", "/notification-templates", data, NotificationTemplateSchema),
    onSuccess: async () => {
      if (session) await qc.invalidateQueries({ queryKey: queryKeys.m07.templates(session) });
    },
  });
}

/** Own preferences through the outbox (L2-style, `lww-audited`): saves now, or queues offline and replays. */
export function useSavePreferences() {
  const { session } = useSession();
  const qc = useQueryClient();
  return useOutboxMutation<PreferencesInput, PreferencesResponse>({
    moduleId: "M07",
    operation: "preferences.save",
    mergeRule: "lww-audited",
    send: async (client, body, idempotencyKey) => {
      const saved = await client.send(
        "PUT",
        "/notification-preferences",
        body,
        PreferencesResponseSchema,
        {
          headers: idempotencyHeaders(idempotencyKey),
        },
      );
      if (session) qc.setQueryData(queryKeys.m07.preferences(session), saved);
      return saved;
    },
  });
}
