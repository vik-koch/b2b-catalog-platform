import { Component, computed, input } from '@angular/core';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { chevronDownIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-down';

const chevron = `pointer-events-none absolute top-1/2 -translate-y-1/2
                 text-ink-subtle transition-colors`;

const chevrons = {
  md: 'right-2.5 h-4 w-4',
  /** Dense rows: the grid's column filters. */
  sm: 'right-1.5 h-3.5 w-3.5',
} as const;

/**
 * A native <select> with a chevron drawn back in the room Input reserves for
 * it. A wrapper, because the chevron is a sibling a directive cannot add; the
 * <select> stays native, with its keyboard, name and mobile picker. Width goes
 * on the host.
 *
 *   <app-select-input class="max-w-72">
 *     <select appInput class="w-full">…</select>
 *   </app-select-input>
 */
@Component({
  selector: 'app-select-input',
  imports: [Icon],
  // The chevron follows the select's border states; only the wrapper sees both.
  host: {
    class: `relative block
            [&:has(select:enabled):not(:focus-within):hover_app-icon]:text-accent
            [&:focus-within_app-icon]:text-secondary`,
  },
  template: `
    <ng-content />
    <app-icon [glyph]="chevronDownIcon" [class]="chevronClass()" />
  `,
})
export class SelectInput {
  protected readonly chevronDownIcon = chevronDownIcon;
  readonly size = input<keyof typeof chevrons>('md');

  protected readonly chevronClass = computed(
    () => `${chevron} ${chevrons[this.size()]}`,
  );
}
