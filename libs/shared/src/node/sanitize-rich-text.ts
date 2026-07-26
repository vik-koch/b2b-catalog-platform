import sanitizeHtml from 'sanitize-html';
import {
  RICH_TEXT_IMAGE_ALIGNMENTS,
  RICH_TEXT_LINK_SCHEMES,
  RICH_TEXT_TAGS,
} from '../lib/page.contract';
import { MEDIA_MAX_IMAGE_WIDTH, MEDIA_URL_PREFIX } from '../lib/media.contract';

const IMAGE_ALIGNMENTS = new Set<string>(RICH_TEXT_IMAGE_ALIGNMENTS);

// A whole number of digits only — no unit, sign, or decimal — then bounded to
// a sane pixel range (1..the stored-image cap, since a display width can never
// usefully exceed the largest stored image). Returns null for anything else, so
// a bad value simply yields no width rather than an unvalidated style.
const parseWidthPixels = (raw: string | undefined): number | null => {
  if (!raw || !/^[0-9]+$/.test(raw)) {
    return null;
  }
  const n = Number(raw);
  return n >= 1 && n <= MEDIA_MAX_IMAGE_WIDTH ? n : null;
};

// A same-origin URL to a single stored file: our prefix, then one path segment
// of the safe charset the store's hashed filenames use. This rejects absolute
// and protocol-relative URLs (an exfiltration/tracking channel) and any path
// traversal — the src is trusted verbatim by the browser, so it is matched, not
// rewritten.
const MEDIA_SRC = new RegExp(`^${MEDIA_URL_PREFIX}/[A-Za-z0-9._-]+$`);
const isAllowedMediaSrc = (src: string | undefined): boolean =>
  typeof src === 'string' && MEDIA_SRC.test(src);

/**
 * The single trust boundary for admin-authored rich text.
 *
 * Applied **on write**, and to seeded content, so the database only ever holds
 * sanitized HTML — every read, and the SSR per-slug HTML cache, is clean by
 * construction and no future consumer of `bodyHtml` can reintroduce an XSS by
 * forgetting to sanitize.
 *
 * It lives in the node-only entry point because `sanitize-html` has no place in
 * a browser bundle; the vocabulary it enforces is shared isomorphic data
 * (RICH_TEXT_TAGS) so the editor is configured from the same list.
 *
 * Sanitizing is lossy and irreversible: disallowed markup is removed, not
 * rejected. That is deliberate — a schema-constrained editor cannot produce it,
 * so this only ever fires on a hand-crafted request.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...RICH_TEXT_TAGS],
    allowedAttributes: {
      // No `target`, no `class`, no `style`, no `on*`. `rel` is listed because
      // attribute filtering runs *after* transformTags — the rel forced below
      // would itself be stripped if it were not allowed here.
      a: ['href', 'title', 'rel'],
      // Placement attributes join the allowlist; their *values* are validated
      // in transformTags below (this only admits the attribute names). `style`
      // is admitted because the transform reconstructs a width-only style from
      // the validated data-width — an author-supplied style never survives.
      img: ['src', 'alt', 'data-align', 'data-width', 'style'],
    },
    allowedSchemes: [...RICH_TEXT_LINK_SCHEMES],
    // `//evil.test/x` inherits the page's scheme and so slips past the scheme
    // allowlist, which only inspects explicit protocols. Off by default in
    // sanitize-html's own config, so this must be set explicitly.
    allowProtocolRelative: false,
    // Every surviving link is cross-origin-safe and non-endorsing, whatever the
    // author typed — simpleTransform overwrites an author-supplied `rel`
    // rather than merging with it.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
      }),
      // Rebuild each img from scratch: keep src/alt, admit data-align only when
      // it is one of the closed enum values, and turn a validated data-width
      // into both the canonical attribute and a reconstructed width-only style
      // (the only style we ever emit — the browser needs an inline pixel width
      // to size the image). Force an alt (empty is valid — a decorative image).
      // An unusable src is dropped here and the tag then removed by
      // exclusiveFilter below.
      img: (tagName, attribs) => {
        const out: Record<string, string> = { alt: attribs['alt'] ?? '' };
        if (isAllowedMediaSrc(attribs['src'])) {
          out['src'] = attribs['src'];
        }
        if (IMAGE_ALIGNMENTS.has(attribs['data-align'])) {
          out['data-align'] = attribs['data-align'];
        }
        const width = parseWidthPixels(attribs['data-width']);
        if (width !== null) {
          out['data-width'] = String(width);
          // Pixels, not a percentage: the width is of the image itself. CSS
          // caps it at the container (max-width:100%), so it cannot overflow.
          out['style'] = `width:${width}px`;
        }
        return { tagName, attribs: out };
      },
    },
    // An img whose src did not survive the transform above references nothing
    // permitted — drop the whole tag rather than emit a broken image.
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs['src'],
    // Drop the *contents* of these, not just the tags: the default keeps inner
    // text, which would leak script source into the page as visible prose.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  });
}
