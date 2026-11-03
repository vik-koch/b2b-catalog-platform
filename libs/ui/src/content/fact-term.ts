import { Directive } from '@angular/core';

/**
 * No row gap: a margin under each half instead, so stacked on a phone a term
 * sits close to its own value and the space falls between the pairs.
 */
@Directive({
  selector: 'dt[uiFactTerm]',
  host: { class: 'text-ink-subtle odd:mb-1 sm:odd:mb-3 nth-last-[2]:mb-0' },
})
export class FactTerm {}
