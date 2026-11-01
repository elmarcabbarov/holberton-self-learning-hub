import { z } from "zod";

/** Stable error codes. `messageKey` is an i18n key; never a raw server message. */
export const ErrorCode = z.enum([
  "unauthorized",
  "forbidden_host",
  "forbidden_origin",
  "not_found",
  "validation_failed",
  "conflict",
  "unsupported_media_type",
  "invalid_token",
  "rate_limited",
  "read_only",
  "payload_too_large",
  "internal",
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    messageKey: z.string(),
    details: z.unknown().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;
