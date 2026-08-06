import { Component, computed, input } from '@angular/core';
import { Icon } from './icons/icon';

const chevrons = {
  md: 'right-2.5 h-4 w-4',
  /** Dense rows — the grid's column filters. */
  sm: 'right-1.5 h-3.5 w-3.5',
} as const;

/**
 * Wraps a native `<select>` and draws the chevron it no longer has: the
 * platform arrow is turned off (`appearance-none`, applied by the Input
 * directive) so a picker looks the same in every browser, and this puts one
 * back in the space the field reserves on its right.
 *
 * A wrapper component rather than part of the Input directive because the
 * chevron is a *sibling* element, which a directive on the select cannot add.
 * The element itself stays a native `<select>` — keyboard behaviour, the
 * accessible name and the mobile picker all come for free, and none of it would
 * survive a custom popup.
 *
 * Width lives on the host, as it does on every other field:
 *
 *   <app-select-field class="max-w-72">
 *     <select appInput class="w-full">…</select>
 *   </app-select-field>
 */
@Component({
  selector: 'app-select-field',
  imports: [Icon],
  host: { class: 'relative block' },
  template: `
    <ng-content />
    <app-icon
      name="chevron-down"
      class="pointer-events-none absolute top-1/2 -translate-y-1/2 text-stone-400"
      [class]="chevron()"
    />
  `,
})
export class SelectField {
  readonly size = input<keyof typeof chevrons>('md');

  protected readonly chevron = computed(() => chevrons[this.size()]);
}
