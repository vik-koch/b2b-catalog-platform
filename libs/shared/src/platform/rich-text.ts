/**
 * The rich-text vocabulary. The server sanitizer strips everything not listed
 * here and the editor is configured from the same lists, so the editor cannot
 * produce markup the server would silently drop.
 */

/**
 * No `h1`: the page title is the page's only one. Nothing carries `class` or
 * `style`.
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

/**
 * The editor offers an image's size as a share of its natural width and
 * stores pixels in `data-width`, which the sanitizer bounds and turns into the
 * inline `width` itself, never parsing CSS.
 */
export const RICH_TEXT_IMAGE_SIZE_MIN_PERCENT = 1;

export const RICH_TEXT_IMAGE_SIZE_MAX_PERCENT = 100;
