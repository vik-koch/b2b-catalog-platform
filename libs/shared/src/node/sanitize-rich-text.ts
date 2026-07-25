import sanitizeHtml from 'sanitize-html';
import { RICH_TEXT_LINK_SCHEMES, RICH_TEXT_TAGS } from '../lib/page.contract';

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
    },
    // Drop the *contents* of these, not just the tags: the default keeps inner
    // text, which would leak script source into the page as visible prose.
    nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
  });
}
