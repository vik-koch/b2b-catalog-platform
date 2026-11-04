import type * as z from 'zod';

/**
 * Substitutes `{placeholder}`s in a piece of app text.
 *
 * Split/join rather than `replace`, which only ever swaps the first match: a
 * placeholder can legitimately appear twice in one sentence — the minimum is
 * also the step ("minimum {qty} {unit}, in steps of {qty}").
 *
 * No plural forms: a text that counts is worded so the number needs no
 * agreement ("Products found: {count}"), which works in every language.
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

/**
 * Refuses a counting text written as `singular|plural` — the convention texts
 * once had — so an old override fails at boot instead of showing both forms.
 * For a text schema's root `.superRefine`.
 */
export function refuseCountForms(text: unknown, ctx: z.RefinementCtx): void {
  const walk = (value: unknown, path: (string | number)[]): void => {
    if (typeof value === 'string') {
      if (value.includes('{count}') && value.includes('|')) {
        ctx.addIssue({
          code: 'custom',
          path,
          message:
            'a counting text has one form: word it without "|" (e.g. "Products: {count}")',
        });
      }
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, [...path, i]));
    } else if (value && typeof value === 'object') {
      for (const [key, item] of Object.entries(value))
        walk(item, [...path, key]);
    }
  };
  walk(text, []);
}
