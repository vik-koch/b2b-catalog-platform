/**
 * Substitutes `{placeholder}`s in a piece of app text.
 *
 * Split/join rather than `replace`, which only ever swaps the first match: a
 * placeholder can legitimately appear twice in one sentence — the minimum is
 * also the step ("minimum {qty} {unit}, in steps of {qty}"), and the packaging
 * formula names the piece unit on both sides of its `=`.
 */
export function fillText(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    template,
  );
}
