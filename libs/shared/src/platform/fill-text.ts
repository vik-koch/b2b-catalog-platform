import type * as z from 'zod';

/**
 * Fills `{placeholder}`s. Split/join, as `replace` swaps the first match only
 * and a placeholder may appear twice ("minimum {qty}, in steps of {qty}").
 * No plural forms: a counting text is worded so the number needs no agreement.
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

/** For a text schema's root `.superRefine`: an override still written as
 * `singular|plural` fails at boot instead of showing both forms. */
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
