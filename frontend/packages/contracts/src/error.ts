import { z } from "zod";
import { IdSchema } from "./common";

/**
 * Error codes every endpoint may return. `module_disabled`: the institution's plan does not include
 * the module (ARCHITECTURE §6); `conflict`: a version or uniqueness clash; `rate_limited`: per-tenant limit.
 */
export const ApiErrorCodeSchema = z.enum([
  "invalid_request",
  "unauthorized",
  "forbidden",
  "not_found",
  "conflict",
  "module_disabled",
  "rate_limited",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

/** One field problem in an `invalid_request`: `path` is a dotted field path, e.g. `locale.timeZone`. */
export const ApiErrorDetailSchema = z.strictObject({
  path: z.string(),
  message: z.string().min(1),
});
export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

/** Body of every non-2xx response. `requestId` matches the server log line (no personal data). */
export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: ApiErrorCodeSchema,
    message: z.string().min(1),
    details: z.array(ApiErrorDetailSchema).optional(),
    requestId: IdSchema.optional(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;
