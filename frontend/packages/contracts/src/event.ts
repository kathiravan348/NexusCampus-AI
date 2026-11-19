import { z } from "zod";
import { IdSchema, ModuleIdSchema, UtcDateTimeSchema } from "./common";

/** `<module>.<entity>.<action>` in dot case, e.g. `m02.user.invited`. */
const EVENT_TYPE = /^[mp]\d{2}(\.[a-z][a-zA-Z0-9]*){2,}$/;

/**
 * Standard domain event envelope (ARCHITECTURE §6, D25), shared by audit, notifications, webhooks,
 * analytics and offline sync. `payload` is defined per event type by the module that emits it.
 */
export const DomainEventSchema = z
  .strictObject({
    eventId: IdSchema,
    tenantId: IdSchema,
    moduleId: ModuleIdSchema,
    eventType: z.string().regex(EVENT_TYPE, {
      message: "Must be <module>.<entity>.<action>, e.g. m02.user.invited",
    }),
    occurredAt: UtcDateTimeSchema,
    /** Null for system events (scheduled jobs, sync merges). */
    actorId: IdSchema.nullable(),
    correlationId: IdSchema,
    schemaVersion: z.int().min(1),
    payload: z.record(z.string(), z.unknown()),
  })
  .refine((e) => e.eventType.startsWith(`${e.moduleId.toLowerCase()}.`), {
    message: "eventType must start with the emitting module, e.g. m02.",
    path: ["eventType"],
  });
export type DomainEvent = z.infer<typeof DomainEventSchema>;
