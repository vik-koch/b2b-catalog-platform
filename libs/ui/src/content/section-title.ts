import { Directive } from '@angular/core';

/**
 * A small-caps heading over a section of a page or panel. Spacing stays with
 * the caller.
 *
 *   <h2 uiSectionTitle class="mb-3">{{ text.specifications }}</h2>
 */
@Directive({
  selector: '[uiSectionTitle]',
  host: {
    class: 'text-xs font-medium tracking-wide text-ink-subtle uppercase',
  },
})
export class SectionTitle {}
