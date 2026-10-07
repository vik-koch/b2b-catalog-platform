import { Component, input } from '@angular/core';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { GridToggleGroup, GridToggleOption } from './grid-column';
import { injectGridNav } from './grid-query';

const PILL =
  'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-sm whitespace-nowrap transition-colors';

/** Off and on. Only colour changes between the two — never the weight — so a
 * chip keeps its width and its neighbours stay put. */
const OFF = `${PILL} border-border bg-white text-muted hover:border-border-strong hover:text-accent`;
const ON = `${PILL} border-border-secondary bg-primary text-white hover:bg-accent`;

/**
 * The toggle chips of a grid (FR-ADM-20): every option in view, each switched
 * on and off by itself, rather than hidden in a select that holds one.
 *
 * One row per group, so a window's width never breaks a group in the middle.
 * The group's name is read to a screen reader but not drawn: its row and its
 * wording already say which question a chip belongs to.
 *
 * Like the column filters it owns its navigation: a click rewrites the one
 * parameter as a list, and an empty list clears it.
 */
@Component({
  selector: 'app-grid-toggles',
  imports: [AdminIcon],
  host: { class: 'flex flex-col gap-2' },
  template: `
    @for (group of groups(); track group.param) {
      <div
        role="group"
        [attr.aria-label]="group.label"
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
              <app-admin-icon [name]="option.icon" class="size-3.5" />
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
