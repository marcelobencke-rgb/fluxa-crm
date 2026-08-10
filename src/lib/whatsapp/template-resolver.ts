// ============================================================
// Template text resolver — for providers that don't support
// native Meta templates (e.g. Evolution API).
//
// Given a template's `body_text` and positional params, replaces
// {{1}}, {{2}}, … with the supplied values. Used by the broadcast
// routes when sending via Evolution so the recipient gets the
// fully-rendered text instead of a raw template reference.
// ============================================================

/**
 * Replace `{{1}}`, `{{2}}`, … placeholders in `bodyText` with
 * the corresponding values from `params` (0-indexed array).
 *
 * Unmatched placeholders are replaced with an empty string so
 * the recipient never sees raw `{{N}}` markers.
 */
export function resolveTemplateText(
  bodyText: string,
  params: string[] = [],
): string {
  return bodyText.replace(/\{\{(\d+)\}\}/g, (_match, index: string) => {
    const i = parseInt(index, 10) - 1; // {{1}} → params[0]
    return i >= 0 && i < params.length ? params[i] : '';
  });
}
