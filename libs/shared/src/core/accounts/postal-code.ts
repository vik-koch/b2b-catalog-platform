/**
 * Reading and checking a postal code. Plain functions with no imports, so the
 * address form does not pull the address and order schemas — and Zod — along
 * with the one rule it needs (see `auth-constants.ts` for why).
 */

/**
 * Postal codes are compared as **fixed-width strings**, never numbers: leading
 * zeros are part of the code, and `01067` as an integer is a different place.
 * Normalized first so `AB1 2CD` and `ab12cd` are the same code.
 */
export function normalizePostalCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * The shape a rule is read through — structural, so the web app's deeply
 * readonly copy of the deployment config satisfies it as readily as the API's.
 */
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

/**
 * Whether a code is the shape its country asks for. Normalized first, for the
 * same reason a registration number is: a code is typed the way it is printed,
 * and refusing `AB1 2CD` over its space would be refusing the code. No rule
 * means no shape to be in.
 */
export function postalCodeMatches(
  value: string,
  rule: PostalCodeRuleLike | undefined,
): boolean {
  if (!rule) return true;
  return new RegExp(rule.pattern).test(normalizePostalCode(value));
}
