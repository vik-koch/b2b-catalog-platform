/** Reading and checking a postal code. Plain functions with no imports, so
 * the address form does not pull Zod along with the one rule it needs. */

/** Compared as strings, never numbers (`01067` keeps its zero), without
 * spaces or case, so `AB1 2CD` and `ab12cd` are one code. */
export function normalizePostalCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/** Structural, so the web app's deeply readonly config satisfies it as
 * readily as the API's. */
export interface PostalCodeRuleLike {
  readonly pattern: string;
  readonly example: string;
  readonly mask?: string;
}

/** The rule for a country, where the deployment wrote one. */
export function postalCodeRuleFor<R extends PostalCodeRuleLike>(
  country: string,
  countries:
    readonly { readonly code: string; readonly postalCode?: R }[] | undefined,
): R | undefined {
  return countries?.find((entry) => entry.code === country)?.postalCode;
}

/** Whether a code is the shape its country asks for, read as typed (a space
 * is no reason to refuse it). No rule, no shape to be in. */
export function postalCodeMatches(
  value: string,
  rule: PostalCodeRuleLike | undefined,
): boolean {
  if (!rule) return true;
  return new RegExp(rule.pattern).test(normalizePostalCode(value));
}
