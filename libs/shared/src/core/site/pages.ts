/**
 * A fixed set: content is edited, a page is never created or deleted. Every
 * deployment has every row; its config decides which it publishes and where
 * they are linked. `withdrawal` is the cancellation notice a shop selling to
 * consumers may owe.
 */
export const PAGE_SLUGS = [
  'about',
  'terms',
  'conditions',
  'privacy',
  'imprint',
  'withdrawal',
  'contact',
  'consent-contact',
  'consent-account',
] as const;
export type PageSlug = (typeof PAGE_SLUGS)[number];

/** A deployment asks for a purpose by switching it on in its config. */
export const CONSENT_PURPOSES = ['contact', 'account'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * Named for the purpose, not the form: the account consent is asked on
 * registration and on an invited holder's first password alike.
 */
export const CONSENT_PAGE_SLUGS = {
  contact: 'consent-contact',
  account: 'consent-account',
} as const satisfies Record<ConsentPurpose, PageSlug>;

export function isConsentPage(slug: string): boolean {
  return (Object.values(CONSENT_PAGE_SLUGS) as string[]).includes(slug);
}

/**
 * `stale`: the text changed after the form loaded it, so the form reloads it
 * and asks again. `unavailable`: the purpose is on but its text was never
 * written, and a form that cannot show what it asks for must not be sent.
 */
export const consentErrors = {
  'consent-required': { status: 400 },
  'consent-stale': { status: 409 },
  'consent-unavailable': { status: 503 },
} as const;
export type ConsentRefusalCode = keyof typeof consentErrors;

export function isConsentRefusal(code: string): code is ConsentRefusalCode {
  return Object.hasOwn(consentErrors, code);
}

export interface ConsentLabelParts {
  readonly before: string;
  readonly link: string;
  readonly after: string;
}

/**
 * Splits the box wording at its part in square brackets, which the form draws
 * as the link to the consent text: `I [consent] to …`. Null unless there is
 * exactly one bracketed part with something in it.
 */
export function consentLabelParts(label: string): ConsentLabelParts | null {
  const match = /^([^[\]]*)\[([^[\]]*[^[\]\s][^[\]]*)\]([^[\]]*)$/.exec(label);
  return match ? { before: match[1], link: match[2], after: match[3] } : null;
}
