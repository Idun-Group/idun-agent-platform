/**
 * Routes backend field_errors into react-hook-form fields.
 *
 * The standalone admin contract emits 422 envelopes with a
 * `fieldErrors` array of `{ field, message, code }`. The frontend's
 * field paths sometimes differ from the backend's dotted paths
 * (e.g. backend `agent.config.graphDefinition` vs form `definition`),
 * so callers may pass an explicit pathMap.
 *
 * Returns:
 *   - `true`  if at least one field error was applied; the caller
 *             should suppress its top-level toast since the form is
 *             now showing the errors inline.
 *   - `false` if the error wasn't an ApiError, or had no fieldErrors;
 *             the caller should fall back to a generic toast.
 */

import type { UseFormReturn } from "react-hook-form";

import { ApiError } from "./client";

export function applyFieldErrors(
  form: UseFormReturn<any>,
  error: unknown,
  pathMap?: Record<string, string>,
): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.fieldErrors.length === 0) return false;
  for (const fe of error.fieldErrors) {
    const formPath = pathMap?.[fe.field] ?? fe.field;
    form.setError(formPath as any, {
      message: fe.message,
      type: fe.code ?? "server",
    });
  }
  return true;
}
