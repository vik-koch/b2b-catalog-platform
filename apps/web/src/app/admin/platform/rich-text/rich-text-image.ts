import { mergeAttributes } from '@tiptap/core';
import Image from '@tiptap/extension-image';
import { DOMOutputSpec } from '@tiptap/pm/model';

/** The stock Image with what the sanitizer allows: `data-align`, `data-width`
 * with the inline width it rebuilds, and a link as a wrapping `<a>`, as a mark
 * cannot apply to a block node. */
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
      // From the wrapping <a>; rendered as that <a>, never on the <img>.
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

  // The stored markup; the editing view below never draws the <a>.
  renderHTML({ node, HTMLAttributes }) {
    const img: DOMOutputSpec = [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
    ];
    const href = node.attrs['href'];
    return href
      ? (['a', { href, rel: 'noopener noreferrer' }, img] as DOMOutputSpec)
      : img;
  },

  // A bare <img> while editing, so a linked image stays selectable.
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
