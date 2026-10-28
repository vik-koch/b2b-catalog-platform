import { Component, computed, inject, input } from '@angular/core';
import { Icon } from '../icons/icon';
import { imageOffIcon } from '../icons/glyphs/image-off';
import { UI_TEXT } from '../core/ui-text';

/**
 * Stands in for a missing picture and fills its box. The caption shows from
 * the width that holds it, measured on the box, not the window.
 */
@Component({
  selector: 'app-image-placeholder',
  imports: [Icon],
  host: {
    role: 'img',
    '[attr.aria-label]': 'ariaLabel()',
    class: `@container/placeholder flex h-full w-full flex-col items-center
            justify-center gap-2 bg-surface text-ink-subtle`,
  },
  template: `
    <app-icon
      [glyph]="imageOffIcon"
      class="size-8 [--icon-stroke-width:1.5]"
      aria-hidden="true"
    />
    <!-- 6rem fits the glyph and two caption lines in a square box; below
         that the glyph says it alone. -->
    <span
      class="hidden px-2 text-center text-xs text-balance
             @min-[6rem]/placeholder:block"
      >{{ caption }}</span
    >
  `,
})
export class ImagePlaceholder {
  protected readonly imageOffIcon = imageOffIcon;
  protected readonly caption = inject(UI_TEXT).imagePlaceholder;

  /** What the picture would show, as its alt would say. */
  readonly label = input<string>('');

  protected readonly ariaLabel = computed(() => {
    const name = this.label();
    return name ? `${name} — ${this.caption}` : this.caption;
  });
}
