import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Icon } from '../icons/icon';
import { xIcon } from '../icons/glyphs/x';
import { IconButton } from '../actions/icon-button';
import { GridChip } from './grid-column';

/** The narrowings with no column, each with its own way out. */
@Component({
  selector: 'ui-grid-chips',
  imports: [RouterLink, Icon, IconButton],
  host: { class: 'block' },
  template: `
    <ul class="flex flex-wrap gap-2 text-sm">
      @for (chip of chips(); track chip.label) {
        <li class="flex items-center gap-2 rounded-full bg-surface px-3 py-1">
          <span class="text-ink-subtle">{{ chip.label }}</span>
          <span class="font-medium">{{ chip.value }}</span>
          <a
            uiIconButton
            variant="danger"
            routerLink="."
            [queryParams]="chip.clearParams"
            queryParamsHandling="merge"
            [attr.aria-label]="chip.clearLabel"
          >
            <ui-icon [glyph]="xIcon" />
          </a>
        </li>
      }
    </ul>
  `,
})
export class GridChips {
  protected readonly xIcon = xIcon;
  readonly chips = input.required<readonly GridChip[]>();
}
