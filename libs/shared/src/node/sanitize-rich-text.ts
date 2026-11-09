import sanitizeHtml from 'sanitize-html';

import { MEDIA_MAX_IMAGE_WIDTH, MEDIA_URL_PREFIX } from '../platform/media';
import {
  RICH_TEXT_IMAGE_ALIGNMENTS,
  RICH_TEXT_LINK_SCHEMES,
  RICH_TEXT_TAGS,
} from '../platform/rich-text';

const IMAGE_ALIGNMENTS = new Set<string>(RICH_TEXT_IMAGE_ALIGNMENTS);

/** Dropped with their contents: the default keeps inner text, which would
 * show script source as prose. */
const NON_TEXT_TAGS = ['style', 'script', 'textarea', 'option', 'noscript'];

/** Digits only, up to the widest stored image; anything else is no width. */
const parseWidthPixels = (raw: string | undefined): number | null => {
  if (!raw || !/^[0-9]+$/.test(raw)) {
    return null;
  }
  const n = Number(raw);
  return n >= 1 && n <= MEDIA_MAX_IMAGE_WIDTH ? n : null;
};

/** One stored file under the media prefix: no other origin, no traversal.
 * Matched, not rewritten, as the browser trusts the src verbatim. */
const MEDIA_SRC = new RegExp(`^${MEDIA_URL_PREFIX}/[A-Za-z0-9._-]+$`);
const isAllowedMediaSrc = (src: string | undefined): boolean =>
  typeof src === 'string' && MEDIA_SRC.test(src);

/**
 * The trust boundary for staff-written rich text, applied on write and to
 * seeds, so every read is clean. Lossy rather than refusing: the editor cannot
 * write what it removes, so only a hand-made request loses anything.
 */
export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...RICH_TEXT_TAGS],
    allowedAttributes: {
      // `rel` because attributes are filtered after transformTags, which
      // would otherwise lose the rel it forces.
      a: ['href', 'title', 'rel'],
      // Values are checked in transformTags, which writes `style` itself.
      img: ['src', 'alt', 'data-align', 'data-width', 'style'],
    },
    allowedSchemes: [...RICH_TEXT_LINK_SCHEMES],
    // `//evil.test/x` has no scheme for the allowlist to check.
    allowProtocolRelative: false,
    // Overwrites an author's `rel` rather than merging with it.
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer',
      }),
      // Rebuilt from checked values only; an empty alt marks a decorative
      // image, and a refused src drops the tag in exclusiveFilter.
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
          // CSS caps it at the container, so it cannot overflow.
          out['style'] = `width:${width}px`;
        }
        return { tagName, attribs: out };
      },
    },
    exclusiveFilter: (frame) => frame.tag === 'img' && !frame.attribs['src'],
    nonTextTags: NON_TEXT_TAGS,
  });
}

/** The same boundary for a vocabulary of bare tags, such as a product
 * description's: no attributes, so nothing needs a transform. */
export function sanitizeToTags(html: string, tags: readonly string[]): string {
  return sanitizeHtml(html, {
    allowedTags: [...tags],
    allowedAttributes: {},
    nonTextTags: NON_TEXT_TAGS,
  });
}
