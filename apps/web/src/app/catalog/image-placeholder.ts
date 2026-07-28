import { Component, computed, inject, input } from '@angular/core';
import { APP_TEXT } from '../config/app-text';

/**
 * Fallback tile for a product (or product image) that has no photo yet. A view
 * concern only — the API models absence as an empty `images` array; the galleries
 * render this in its place. Fills its container (`aspect-square` framings on the
 * grid tile and the product page alike), so one component covers a tiny thumb and
 * the large product image. The caption is deployment text (`catalog.imagePlaceholder`)
 * and hides on small renders where it would be unreadable; the glyph is the owned
 * Lucide `image-off` (ISC), inlined as page-level chrome rather than pulled from the
 * editor-only icon set.
 */
@Component({
  selector: 'app-image-placeholder',
  host: {
    role: 'img',
    '[attr.aria-label]': 'ariaLabel()',
    class:
      'flex h-full w-full flex-col items-center justify-center gap-2 bg-stone-100 text-stone-400',
  },
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="h-8 w-8"
      aria-hidden="true"
    >
      <line x1="2" x2="22" y1="2" y2="22" />
      <path d="M10.41 10.41a2 2 0 1 1-2.83-2.83" />
      <line x1="13.5" x2="6" y1="13.5" y2="21" />
      <line x1="18" x2="21" y1="12" y2="15" />
      <path
        d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"
      />
      <path d="M21 15V5a2 2 0 0 0-2-2H9" />
    </svg>
    <span class="hidden px-2 text-center text-xs sm:block">{{
      text.imagePlaceholder
    }}</span>
  `,
})
export class ImagePlaceholder {
  protected readonly text = inject(APP_TEXT).catalog;

  /** Product name — the placeholder's accessible label, matching a real image's alt. */
  label = input<string>('');

  /** "<product> — no image available", or just the caption when unlabelled. */
  protected ariaLabel = computed(() => {
    const name = this.label();
    return name
      ? `${name} — ${this.text.imagePlaceholder}`
      : this.text.imagePlaceholder;
  });
}
