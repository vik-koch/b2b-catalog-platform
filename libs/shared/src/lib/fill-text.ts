/**
 * Substitutes `{placeholder}`s in a piece of app text.
 *
 * Split/join rather than `replace`, which only ever swaps the first match: a
 * placeholder can legitimately appear twice in one sentence — the minimum is
 * also the step ("minimum {qty} {unit}, in steps of {qty}"), and the packaging
 * formula names the piece unit on both sides of its `=`.
 *
 * A text that counts something may carry two forms separated by a `|`, the
 * singular first: `"{count} product found|{count} products found"`. The form
 * is chosen by the `count` value, and a text without a `|` is used as it is,
 * so only the strings that need the distinction carry it.
 *
 * Two forms, not a plural-rule engine. Each deployment ships one language's
 * text and no i18n framework goes with it, so there is nothing here that could
 * know a third form was needed — a language that has one writes the sentence
 * to avoid it, the way the shop's own text already avoids everything else a
 * framework would be for.
 */
export function fillText(
  template: string,
  values: Record<string, string | number>,
): string {
  return Object.entries(values).reduce(
    (out, [key, value]) => out.split(`{${key}}`).join(String(value)),
    pickForm(template, values['count']),
  );
}

/** The singular before the `|`, the plural after it. */
function pickForm(
  template: string,
  count: string | number | undefined,
): string {
  const forms = template.split('|');
  if (forms.length < 2) return template;
  return Number(count) === 1 ? forms[0] : forms[1];
}
