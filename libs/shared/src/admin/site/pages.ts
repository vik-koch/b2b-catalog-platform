/** Matches the `pages.title` varchar. */
export const PAGE_TITLE_MAX_LENGTH = 255;

/**
 * A DoS guard, not an editorial rule. Below Express's 100 KB body limit, so an
 * oversized body fails validation with a 400 the editor can explain rather
 * than an opaque 413.
 */
export const PAGE_BODY_MAX_LENGTH = 64_000;

/** The wording beside a consent box: a sentence, not a text. */
export const CONSENT_LABEL_MAX_LENGTH = 500;
