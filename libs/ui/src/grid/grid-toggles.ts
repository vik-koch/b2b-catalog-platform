import { Component, input } from '@angular/core';
import { Icon } from '../icons/icon';
import { GridToggleGroup, GridToggleOption } from './grid-column';
import { injectGridNav } from './grid-nav';

const PILL = `inline-flex cursor-pointer items-center gap-1.5 rounded-full
              border px-3 py-1 text-sm whitespace-nowrap transition-colors`;

/** Only the colour changes, never the weight: a chip keeps its width. */
const OFF = `${PILL} border-edge bg-white text-ink-subtle
             hover:border-edge-strong hover:text-accent`;
const ON = `${PILL} border-primary bg-primary text-white
            hover:border-accent hover:bg-accent`;

/**
 * A grid's toggle chips (FR-ADM-20): every option in view, each on or off by
 * itself, one row per group. The group's name is for screen readers only. A
 * click rewrites the parameter as a list; an empty list clears it.
 */
@Component({
  selector: 'ui-grid-toggles',
  imports: [Icon],
  host: { class: 'flex flex-col gap-2' },
  template: `
    @for (group of groups(); track group.param) {
      <div
        role="group"
        [attr.aria-label]="group.ariaLabel"
        class="flex flex-wrap items-center gap-2"
      >
        @for (option of group.options; track option.value) {
          <button
            type="button"
            [attr.aria-pressed]="isOn(group, option)"
            [class]="isOn(group, option) ? on : off"
            (click)="toggle(group, option)"
          >
            @if (option.icon) {
              <ui-icon [glyph]="option.icon" class="size-3.5" />
            }
            {{ option.label }}
          </button>
        }
      </div>
    }
  `,
})
export class GridToggles {
  private readonly navigate = injectGridNav();
  protected readonly on = ON;
  protected readonly off = OFF;

  readonly groups = input.required<readonly GridToggleGroup[]>();

  protected isOn(group: GridToggleGroup, option: GridToggleOption): boolean {
    return group.selected.includes(option.value);
  }

  protected toggle(group: GridToggleGroup, option: GridToggleOption): void {
    const next = this.isOn(group, option)
      ? group.selected.filter((value) => value !== option.value)
      : [...group.selected, option.value];
    this.navigate({ [group.param]: next.length ? next : null });
  }
}
