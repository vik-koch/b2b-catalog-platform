import {
  afterNextRender,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { fillText } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { Button } from '../../ui/button';
import { Checkbox } from '../../ui/checkbox';
import { DialogActions } from '../../ui/dialog-actions';
import { DialogPanel } from '../../ui/dialog-panel';
import { HintBadge } from '../../ui/hint-badge';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { AttributeHint } from './attribute-hints';

/**
 * "Add attributes" — the names the catalog already uses, in a dialog opened
 * from under the grid (FR-ATTR-09). Checking names appends one empty row each,
 * so the first product of a category is filled from what the rest of the
 * catalog calls things instead of from memory; that is what keeps "Length" and
 * "Lenght" from becoming two attributes in the first place.
 *
 * A dialog rather than a box above the grid: the boxes further down the editor
 * are the product's optional extras, and a tool for filling the grid is not
 * one of them. It cannot live inside a grid cell either — the grid is one
 * `contenteditable` region whose cells are read back from the DOM, so a
 * control rendered in a cell is destroyed by the next paste.
 *
 * Names already in the table are listed and disabled rather than dropped: their
 * absence would read as "this attribute is unknown here", which is the opposite
 * of what it means.
 */
@Component({
  selector: 'app-attribute-key-picker',
  imports: [AdminIcon, Button, Checkbox, DialogActions, DialogPanel, HintBadge],
  template: `
    <dialog
      #dialog
      appDialogPanel
      size="lg"
      aria-labelledby="attribute-key-picker-heading"
      (cancel)="closed.emit()"
    >
      <h2
        id="attribute-key-picker-heading"
        class="text-xl font-normal tracking-tight"
      >
        {{ text.addKeys }}
      </h2>
      <p class="mt-2 text-xs text-subtle">{{ text.addKeysHint }}</p>
      @if (hints().length === 0) {
        <p class="mt-3 text-sm text-muted">{{ text.addKeysEmpty }}</p>
      } @else {
        <!-- Right padding, not on the rows: the counts would otherwise sit
             against the scrollbar of a long list. -->
        <ul class="mt-3 max-h-80 overflow-y-auto pr-2">
          @for (hint of hints(); track hint.key) {
            <li>
              <label
                class="flex cursor-pointer items-center gap-2 py-1 text-sm has-[input:disabled]:cursor-not-allowed"
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
                    <app-admin-icon name="funnel" class="size-3.5" />
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
      }

      <div appDialogActions>
        <button
          appButton
          variant="secondary"
          type="button"
          (click)="closed.emit()"
        >
          {{ common.cancel }}
        </button>
        <button
          appButton
          type="button"
          class="gap-2"
          [disabled]="picked().length === 0"
          (click)="apply()"
        >
          <app-admin-icon name="plus" class="size-4" />
          {{ applyLabel() }}
        </button>
      </div>
    </dialog>
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
  /** Cancelled or dismissed; the host removes the dialog. */
  readonly closed = output<void>();

  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly checked = signal<string[]>([]);

  constructor() {
    // showModal() for the focus trap and backdrop; the host removes this
    // component to close it, and a removed dialog is closed.
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  /** What checking would actually add: a name already in the grid is not
   * counted by the button, nor added a second time. */
  protected readonly picked = computed(() =>
    this.checked().filter((key) => !this.used().includes(key)),
  );

  protected readonly applyLabel = computed(() =>
    fillText(this.text.addKeysApply, { count: this.picked().length }),
  );

  protected select(key: string, checked: boolean): void {
    this.checked.update((keys) =>
      checked ? [...keys, key] : keys.filter((k) => k !== key),
    );
  }

  /** The rows are appended at the bottom of the grid, and the dialog closes
   * so they can be seen arriving. */
  protected apply(): void {
    const keys = this.picked();
    if (keys.length === 0) return;
    this.add.emit(keys);
  }

  protected productsLabel(count: number): string {
    return this.text.products.replace('{count}', String(count));
  }
}
