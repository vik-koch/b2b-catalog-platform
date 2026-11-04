/** The rich-text vocabulary: the sanitizer strips what is not listed and the
 * editor is built from the same lists, so it cannot write what would be lost. */

/** No `h1`: the page title is the page's only one. */
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

/**
 * A list because of `javascript:` and `data:`. A root-relative path carries no
 * scheme and passes; a protocol-relative one (`//host`) does not.
 */
export const RICH_TEXT_LINK_SCHEMES = [
  'http',
  'https',
  'mailto',
  'tel',
] as const;

/** A closed set, never free CSS: the sanitizer allowlists it by string. */
export const RICH_TEXT_IMAGE_ALIGNMENTS = ['left', 'center', 'right'] as const;

/** The editor sizes an image as a share of its natural width and stores
 * pixels in `data-width`; the sanitizer writes the inline width from that,
 * never parsing CSS. */
export const RICH_TEXT_IMAGE_SIZE_MIN_PERCENT = 1;
export const RICH_TEXT_IMAGE_SIZE_MAX_PERCENT = 100;
