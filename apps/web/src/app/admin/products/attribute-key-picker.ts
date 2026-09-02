import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { DisclosureToggle } from '../../ui/disclosure-toggle';
import { HintBadge } from '../../ui/hint-badge';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { AttributeHint } from './attribute-hints';

/**
 * "Add attributes" — the hint list of names the catalog already uses, above the
 * grid (FR-ATTR-09). Checking names appends one empty row each, so the first
 * product of a category is filled from what the rest of the catalog calls
 * things instead of from memory; that is what keeps "Length" and "Lenght" from
 * becoming two attributes in the first place.
 *
 * It cannot live inside a grid cell. The grid is one `contenteditable` region
 * whose cells are read back from the DOM, so a control rendered in a cell is
 * destroyed by the next paste — the same trap that made the packaging editor a
 * table of its own.
 *
 * Names already in the table are listed and disabled rather than dropped: their
 * absence would read as "this attribute is unknown here", which is the opposite
 * of what it means.
 */
@Component({
  selector: 'app-attribute-key-picker',
  imports: [AdminIcon, Button, Checkbox, DisclosureToggle, HintBadge],
  template: `
    <!-- One box: the lid and everything it opens share a border, the same
         disclosure the admin grids and the storefront's facets wear. Its
         chevron is the affordance, so nothing here says "plus" twice. -->
    <div
      class="mb-4 max-w-xl rounded-md border transition-colors"
      [class]="open() ? 'border-accent' : 'border-border-strong'"
    >
      <app-disclosure-toggle
        [label]="text.addKeys"
        [count]="picked().length"
        [countLabel]="countLabel()"
        [open]="open()"
        panelId="attribute-key-picker-panel"
        (toggled)="toggle()"
      />
      @if (open()) {
        <div id="attribute-key-picker-panel" class="border-t border-border p-4">
          <p class="text-xs text-subtle">{{ text.addKeysHint }}</p>
          @if (hints().length === 0) {
            <p class="mt-2 text-sm text-muted">{{ text.addKeysEmpty }}</p>
          } @else {
            <!-- Right padding, not on the rows: the counts would otherwise sit
                 against the scrollbar of a long list. -->
            <ul class="mt-2 max-h-60 overflow-y-auto pr-2">
              @for (hint of hints(); track hint.key) {
                <li>
                  <label
                    class="flex items-center gap-2 py-1 text-sm"
                    [class.text-subtle]="used().includes(hint.key)"
                  >
                    <input
                      type="checkbox"
                      appCheckbox
                      [checked]="picked().includes(hint.key)"
                      [disabled]="used().includes(hint.key)"
                      (change)="select(hint.key, $any($event.target).checked)"
                    />
                    <span>{{ hint.key }}</span>
                    <!-- The same badge the grid row shows, for the same fact. -->
                    @if (hint.type) {
                      <app-hint-badge tone="neutral" [label]="text.filterable">
                        <app-admin-icon name="funnel" class="h-3.5 w-3.5" />
                      </app-hint-badge>
                    }
                    <span class="ml-auto pl-3 text-xs text-subtle">
                      @if (used().includes(hint.key)) {
                        {{ text.inTable }}
                      } @else {
                        {{ productsLabel(hint.productCount) }}
                      }
                    </span>
                  </label>
                </li>
              }
            </ul>
            <button
              appButton
              size="sm"
              type="button"
              class="mt-3 gap-2"
              [disabled]="picked().length === 0"
              (click)="apply()"
            >
              <app-admin-icon name="plus" class="h-4 w-4" />
              {{ applyLabel() }}
            </button>
          }
        </div>
      }
    </div>
  `,
})
export class AttributeKeyPicker {
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productEditor.attributes;

  /** Every name the catalog knows, declared or freetext, alphabetically. */
  readonly hints = input.required<readonly AttributeHint[]>();
  /** Names the grid already holds — offered, but not twice. */
  readonly used = input<readonly string[]>([]);

  /** The checked names, in the order the grid should append them. */
  readonly add = output<string[]>();

  protected readonly open = signal(false);
  private readonly checked = signal<string[]>([]);

  /**
   * What checking would actually add. A name typed into the grid while the
   * panel is open is already there, so it drops out of the selection rather
   * than being counted by the button and added a second time.
   */
  protected readonly picked = computed(() =>
    this.checked().filter((key) => !this.used().includes(key)),
  );

  protected readonly applyLabel = computed(() =>
    this.text.addKeysApply.replace('{count}', String(this.picked().length)),
  );

  /** What the lid says is checked, in the deployment's own bracketing. */
  protected readonly countLabel = computed(() =>
    fillText(this.common.countSuffix, { count: this.picked().length }),
  );

  protected toggle(): void {
    this.open.update((open) => !open);
    this.checked.set([]);
  }

  protected select(key: string, checked: boolean): void {
    this.checked.update((keys) =>
      checked ? [...keys, key] : keys.filter((k) => k !== key),
    );
  }

  /**
   * Closes on apply: the rows are added at the bottom of the grid, and a panel
   * left open over them hides the very thing that just happened.
   */
  protected apply(): void {
    const keys = this.picked();
    if (keys.length === 0) return;
    this.add.emit(keys);
    this.checked.set([]);
    this.open.set(false);
  }

  protected productsLabel(count: number): string {
    return this.text.products.replace('{count}', String(count));
  }
}
