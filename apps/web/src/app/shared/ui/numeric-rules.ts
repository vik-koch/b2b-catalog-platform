/** The decimals a `decimal` input accepts. */
const DECIMAL_PLACES = 3;
const DECIMAL = new RegExp(`^\\d*([.,]\\d{0,${DECIMAL_PLACES}})?$`);

/** What a numeric text input may hold while it is typed, for `[appAllow]`. */
export const numericRules = {
  /** A count: digits only, so no separator, sign or exponent. */
  integer: (next: string) => /^\d*$/.test(next),
  /** A count that can go below zero. */
  signed: (next: string) => /^-?\d*$/.test(next),
  /** A measurement, with either separator. */
  decimal: (next: string) => DECIMAL.test(next),
} as const;

export type NumericKind = keyof typeof numericRules;
