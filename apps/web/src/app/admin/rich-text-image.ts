import Image from '@tiptap/extension-image';

/**
 * The editor's image node, extending the stock Image with the two placement
 * attributes the server allows: `data-align` (an enum) and `data-width` (a
 * percentage). Width is rendered both as `data-width` (the canonical value the
 * server validates and the editor reads back) and as an inline `width` style so
 * the size is visible while editing — the same style the sanitizer reconstructs
 * on save. Nothing here is trusted: the server re-validates every attribute.
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
            ? { 'data-width': String(width), style: `width:${width}%` }
            : {};
        },
      },
    };
  },
});
