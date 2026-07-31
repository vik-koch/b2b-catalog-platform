import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { DOMOutputSpec } from '@tiptap/pm/model';

/**
 * The editor's image node, extending the stock Image with the attributes the
 * server allows: `data-align` (an enum), `data-width` (a pixel width of the
 * image), and an optional link. Width renders as `data-width` plus an inline
 * `width` style so the size is visible while editing — the same style the
 * sanitizer reconstructs on save. A link renders as a wrapping `<a>` (a mark
 * cannot apply to a block node), which the server sanitizer treats exactly like
 * any other link. Nothing here is trusted: the server re-validates everything.
 */
export const RichTextImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      align: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-align'),
        renderHTML: (attributes) =>
          attributes['align'] ? { 'data-align': attributes['align'] } : {},
      },
      width: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-width'),
        renderHTML: (attributes) => {
          const width = attributes['width'];
          return width
            ? { 'data-width': String(width), style: `width:${width}px` }
            : {};
        },
      },
      // Read from the wrapping <a> when there is one; rendered by the node's
      // renderHTML below (as the <a>), never as an attribute on the <img>.
      href: {
        default: null,
        parseHTML: (element) =>
          element.parentElement?.tagName === 'A'
            ? element.parentElement.getAttribute('href')
            : null,
        renderHTML: () => ({}),
      },
    };
  },

  // Export markup (what getHTML serializes and the server stores): a linked
  // image is a wrapping <a>. This is NOT used for the editing view — see the
  // NodeView below — so the anchor never gets in the way of selecting the image.
  renderHTML({ node, HTMLAttributes }) {
    const img: DOMOutputSpec = [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ];
    const href = node.attrs['href'];
    // rel matches the text-link policy; the sanitizer re-forces it anyway.
    return href
      ? (['a', { href, rel: 'noopener noreferrer' }, img] as DOMOutputSpec)
      : img;
  },

  // Editing view: always a bare <img> so the node stays directly selectable and
  // the placement panel keeps working after a link is applied. The link is a
  // non-interactive affordance (data-linked) here; it only becomes a real <a>
  // in the exported HTML above.
  addNodeView() {
    return ({ node, HTMLAttributes }) => {
      const dom = document.createElement('img');
      for (const [key, value] of Object.entries(HTMLAttributes)) {
        if (value != null) {
          dom.setAttribute(key, String(value));
        }
      }
      if (node.attrs['href']) {
        dom.setAttribute('data-linked', 'true');
      }
      return { dom };
    };
  },
});
