/**
 * The fixed set of page slugs (0027), and the subset that has its own route
 * rather than being served by the generic page component. Plain data with no
 * imports, so routing can read it without pulling the page schemas — and Zod —
 * into the first load (see `auth-constants.ts` for why).
 */

/**
 * The static pages are a fixed set — content is edited, pages are never
 * created or deleted. `withdrawal` is the cancellation notice some
 * jurisdictions require of a shop selling to consumers (NFR-LEGAL-04); like
 * `imprint` it exists in the set for every deployment and is published only by
 * the ones that owe it. The API answers 404 for any other slug. Which of them a
 * deployment publishes, and where they appear in the navigation, is deployment
 * config; the set itself is a compile-time contract shared with the database,
 * whose page rows are keyed by these slugs.
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

/**
 * The subset served by the generic `/:slug` route. `contact` and `conditions`
 * are deliberately absent: they have an editable body like the others, but a
 * code route renders each so what it states from configuration — the office
 * list and map embeds, the delivery zones, pickup points and payment methods —
 * keeps its own markup around the prose. The consent texts are absent too:
 * each lives under the form that asks for it (`CONSENT_PATHS`).
 *
 * Which of these a given deployment actually publishes is a separate,
 * per-deployment decision (see the `pages` block in the deployment config).
 */
export const STANDALONE_PAGE_SLUGS = [
  'about',
  'terms',
  'privacy',
  'imprint',
  'withdrawal',
] as const satisfies readonly PageSlug[];
export type StandalonePageSlug = (typeof STANDALONE_PAGE_SLUGS)[number];

/**
 * The pages that say when their text last changed: the ones a reader may hold
 * the shop to, where which text they read matters. The others are the shop
 * describing itself.
 */
export const DATED_PAGE_SLUGS = [
  'terms',
  'conditions',
  'privacy',
  'imprint',
  'withdrawal',
  'consent-contact',
  'consent-account',
] as const satisfies readonly PageSlug[];

export function isDatedPage(slug: string): boolean {
  return (DATED_PAGE_SLUGS as readonly string[]).includes(slug);
}

/**
 * What a person can consent to (NFR-LEGAL-09), each with its own text. A
 * deployment asks for a purpose by switching it on (`consent` in the
 * deployment config), and for nothing otherwise.
 */
export const CONSENT_PURPOSES = ['contact', 'account'] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

/**
 * Each purpose's text, as a page key. Named for the purpose rather than the
 * form: the account consent is asked on registration and on an invited
 * holder's first password alike.
 */
export const CONSENT_PAGE_SLUGS = {
  contact: 'consent-contact',
  account: 'consent-account',
} as const satisfies Record<ConsentPurpose, PageSlug>;

/**
 * Where each text is read: under the form that asks for it. The account text
 * sits under registration rather than `/account`, which is behind sign-in,
 * because the people who read it have no session yet.
 */
export const CONSENT_PATHS = {
  contact: '/inquiry/consent',
  account: '/register/consent',
} as const satisfies Record<ConsentPurpose, string>;

export function isConsentPage(slug: string): boolean {
  return (Object.values(CONSENT_PAGE_SLUGS) as string[]).includes(slug);
}

/**
 * Why a form's consent was refused. `required`: the box was not ticked.
 * `stale`: the text changed after the form loaded it, so the person ticked
 * wording that is no longer current — the form reloads it and asks again.
 * `unavailable`: the deployment asks for the purpose but its text has never
 * been written, and a form that cannot show what it asks for must not be sent.
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

/** The wording beside the box: a sentence, not a text. */
export const CONSENT_LABEL_MAX_LENGTH = 500;

/**
 * How a consent ended (NFR-LEGAL-09). The account consent ends with the
 * account: deleted, or, for a registration, declined and removed. Any other
 * withdrawal reaches the shop from outside and is entered by an admin.
 */
export const CONSENT_WITHDRAWAL_REASONS = [
  'account-deleted',
  'registration-declined',
  'entered',
] as const;
export type ConsentWithdrawalReason =
  (typeof CONSENT_WITHDRAWAL_REASONS)[number];

/** What an admin notes beside a withdrawal they enter: how it reached them. */
export const CONSENT_WITHDRAWAL_NOTE_MAX = 500;

/** The box wording around its one linked part. */
export interface ConsentLabelParts {
  readonly before: string;
  readonly link: string;
  readonly after: string;
}

/**
 * Splits the box wording at the part in square brackets, which the form draws
 * as the link to the consent text: `I [consent] to …`. Null unless there is
 * exactly one bracketed part with something in it.
 */
export function consentLabelParts(label: string): ConsentLabelParts | null {
  const match = /^([^[\]]*)\[([^[\]]*[^[\]\s][^[\]]*)\]([^[\]]*)$/.exec(label);
  return match ? { before: match[1], link: match[2], after: match[3] } : null;
}

/**
 * The rich-text vocabulary, declared once and isomorphic on purpose:
 * the server sanitizer (`sanitizeRichText`, shared/node) strips everything not
 * listed here, and the editor's schema is configured from the same constants —
 * so the editor cannot produce markup the server would silently drop.
 *
 * Deliberately absent: `h1` (the page title renders the page's only h1, so
 * bodies start at h2), tables (may be added later), and anything
 * carrying `class`/`style`.
 */
export const RICH_TEXT_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'hr',
  'a',
  'img',
] as const;

/** Link targets we accept. `javascript:`/`data:` are the reason this is a list. */
export const RICH_TEXT_LINK_SCHEMES = ['http', 'https', 'mailto'] as const;

/**
 * Image alignment is a closed enum, never free-form CSS: the sanitizer
 * allowlists it by string comparison and our own styles render it (block with
 * auto margins for `center`; float so text wraps for `left`/`right`).
 */
export const RICH_TEXT_IMAGE_ALIGNMENTS = ['left', 'center', 'right'] as const;

/**
 * Image size is a free pixel width of the image itself, carried as a
 * `data-width` integer. It stays allowlistable despite being free: the value is
 * a bounded integer the sanitizer validates by pattern and range (1..the upload
 * cap), from which it reconstructs the inline `width` style — it never parses
 * CSS. The rendered image is capped at the container via CSS `max-width:100%`,
 * so a width wider than the column simply fills it rather than overflowing.
 *
 * The editor presents this as a percentage of the image's natural size (a "size"
 * slider); it converts to pixels before storing, so the stored value is always
 * absolute and resolution-honest.
 */
export const RICH_TEXT_IMAGE_SIZE_MIN_PERCENT = 1;

export const RICH_TEXT_IMAGE_SIZE_MAX_PERCENT = 100;

/** Matches the `pages.title` varchar. */
export const PAGE_TITLE_MAX_LENGTH = 255;

/**
 * A DoS guard, not an editorial rule — far more than any static page needs.
 * Kept comfortably below Express's default 100 KB body limit so an oversized
 * body fails contract validation with a 400 the editor can explain, rather than
 * being cut off by the body parser with an opaque 413.
 */
export const PAGE_BODY_MAX_LENGTH = 64_000;
