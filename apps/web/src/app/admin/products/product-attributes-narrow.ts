import {
  CdkDrag,
  CdkDragDrop,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import {
  fillText,
  PRODUCT_ATTRIBUTES_MAX,
  ProductAttribute,
  strayPart,
} from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../shared/config/admin-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { HintBadge } from '@b2b-catalog-platform/ui/content/hint-badge';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { RecordFields } from '@b2b-catalog-platform/ui/lists/record-fields';
import { RecordFormActions } from '@b2b-catalog-platform/ui/lists/record-form-actions';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import {
  AttributeHint,
  attributeRowKey,
  attributeRowStatus,
} from './attribute-hints';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { funnelIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel';
import { gripVerticalIcon } from '@b2b-catalog-platform/ui/icons/glyphs/grip-vertical';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { saveIcon } from '@b2b-catalog-platform/ui/icons/glyphs/save';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { triangleAlertIcon } from '@b2b-catalog-platform/ui/icons/glyphs/triangle-alert';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';

/**
 * The product's attributes on a phone (FR-CAT-05).
 *
 * The desktop editor is a spreadsheet — one `contenteditable` region, a mouse
 * selection spanning cells, TSV in and out — and every one of those affordances
 * needs a pointer and a keyboard. Below `sm` none of them is reachable, and
 * what is left is a three-column table squeezed into 360px with an action
 * column half as wide as the screen.
 *
 * So this is not that table restyled. It is the record list the rest of the
 * admin panel uses: the attribute as it stands, and a pencil that turns that
 * one row into two fields. Read-only first, because scanning what a product
 * already says is the common case and a column of live inputs answers a
 * question nobody asked.
 *
 * One row edits at a time, and it commits on close — there is no separate save
 * here, the product's own save is the save.
 */
@Component({
  selector: 'app-product-attributes-narrow',
  imports: [
    Icon,
    Icon,
    Button,
    HintBadge,
    IconButton,
    Input,
    FieldLabel,
    RecordFields,
    RecordFormActions,
    RecordRow,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  template: `
    <ul
      class="max-w-xl divide-y divide-edge border-y border-edge"
      cdkDropList
      [cdkDropListDisabled]="editing() !== null"
      (cdkDropListDropped)="onDrop($event)"
    >
      @for (row of rows(); track $index) {
        <li class="py-3" cdkDrag [cdkDragData]="row">
          @if (editing() === $index) {
            <!-- The same two-column form the tiers and the filterable
                 attributes wear: both fields on one line from sm up, one per
                 line below it, and the two buttons on a line of their own. -->
            <form uiRecordFields (submit)="commit($event)">
              <label class="block">
                <span uiFieldLabel>{{ text.key }}</span>
                <input
                  uiInput
                  size="sm"
                  class="w-full"
                  autocomplete="off"
                  [value]="row.key"
                  [placeholder]="text.key"
                  (input)="edit($index, 'key', $any($event.target).value)"
                />
              </label>
              <label class="block">
                <span uiFieldLabel>{{ text.value }}</span>
                <input
                  uiInput
                  size="sm"
                  class="w-full"
                  autocomplete="off"
                  [value]="row.value"
                  [placeholder]="unitOf(row) || text.value"
                  (input)="edit($index, 'value', $any($event.target).value)"
                />
              </label>
              <div uiRecordFormActions>
                <button uiButton size="sm" type="submit" class="gap-2">
                  <ui-icon [glyph]="saveIcon" class="size-4" />
                  {{ adminText.actions.save }}
                </button>
                <button
                  uiButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  class="gap-2"
                  (click)="cancel()"
                >
                  <ui-icon [glyph]="xIcon" class="size-4" />
                  {{ actionText.cancel }}
                </button>
              </div>
            </form>
          } @else {
            <ui-record-row>
              <!-- The grip leads the row, where every other record list in the
                   panel puts it: the control that acts on the whole row, not
                   one of the buttons at the other end. -->
              <span
                recordControl
                cdkDragHandle
                uiIconButton
                size="lead"
                class="cursor-grab active:cursor-grabbing"
                [attr.aria-label]="adminText.actions.reorder"
              >
                <ui-icon [glyph]="gripVerticalIcon" />
              </span>
              <span
                class="font-medium wrap-break-word text-ink"
                [class.text-ink-subtle]="row.key.trim() === ''"
              >
                {{ row.key.trim() || text.key }}
              </span>
              <!-- The same fact the desktop grid marks over the key cell: the
                   shop filters by this name. Beside the key, because it is the
                   *key* that is filterable — pushed to the far end of the row
                   it read as a property of the buttons under it. -->
              @if (strayLabel(row); as label) {
                <ui-hint-badge tone="warning" [label]="label">
                  <ui-icon [glyph]="triangleAlertIcon" class="size-3.5" />
                </ui-hint-badge>
              }
              @if (isFilterable(row)) {
                <ui-hint-badge tone="neutral" [label]="text.filterable">
                  <ui-icon [glyph]="funnelIcon" class="size-3.5" />
                </ui-hint-badge>
              }
              <ng-container recordMeta>
                <span
                  class="wrap-break-word"
                  [class.text-ink-subtle]="!row.value.trim()"
                >
                  {{ row.value.trim() || dash }}
                </span>
                @if (valueMark(row); as mark) {
                  @if (mark === 'not-numeric') {
                    <ui-hint-badge tone="warning" [label]="text.notNumeric">
                      <ui-icon [glyph]="triangleAlertIcon" class="size-3.5" />
                    </ui-hint-badge>
                  } @else {
                    <span class="text-xs">{{ mark }}</span>
                  }
                }
              </ng-container>
              <!-- Add, edit, delete — the order every other list in the panel
                   ends on, so a row of glyphs means the same thing wherever it
                   is read. -->
              <ng-container recordActions>
                <button
                  uiIconButton
                  type="button"
                  [attr.aria-label]="text.addAria"
                  (click)="addBelow($index)"
                >
                  <ui-icon [glyph]="plusIcon" />
                </button>
                <button
                  uiIconButton
                  type="button"
                  [attr.aria-label]="adminText.actions.edit"
                  (click)="open($index)"
                >
                  <ui-icon [glyph]="pencilIcon" />
                </button>
                <button
                  uiIconButton
                  variant="danger"
                  type="button"
                  [attr.aria-label]="actionText.remove"
                  (click)="remove($index)"
                >
                  <ui-icon [glyph]="trash2Icon" />
                </button>
              </ng-container>
            </ui-record-row>
          }
        </li>
      }
    </ul>
  `,
})
export class ProductAttributesNarrow {
  protected readonly funnelIcon = funnelIcon;
  protected readonly gripVerticalIcon = gripVerticalIcon;
  protected readonly pencilIcon = pencilIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly saveIcon = saveIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly triangleAlertIcon = triangleAlertIcon;
  protected readonly xIcon = xIcon;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor.attributes;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly dash = '—';

  readonly value = input.required<ProductAttribute[]>();
  readonly valueChange = output<ProductAttribute[]>();
  /** What the rest of the catalog carries, for the badges — the same list the
   * key picker above is built from. */
  readonly hints = input<readonly AttributeHint[]>([]);
  /** The product's parts (FR-CAT-10), as the desktop grid reads them. */
  readonly parts = input<readonly string[]>([]);

  /** Which row is open as fields, if any. */
  protected readonly editing = signal<number | null>(null);
  /** That row as it stood when it was opened, for cancel. Editing writes
   * straight through — the fields have to show what was typed — so undoing is
   * putting this back. */
  private opened: ProductAttribute | null = null;

  private readonly hintsByKey = computed(
    () => new Map(this.hints().map((hint) => [hint.key, hint])),
  );

  /** Always render at least one (empty) row, as the desktop grid does. */
  protected readonly rows = computed<ProductAttribute[]>(() =>
    this.value().length > 0 ? this.value() : [{ key: '', value: '' }],
  );

  private status(row: ProductAttribute) {
    return attributeRowStatus(row, this.hintsByKey(), this.parts());
  }

  protected isFilterable(row: ProductAttribute): boolean {
    const status = this.status(row);
    return status === 'filterable' || status === 'not-numeric';
  }

  /** The stray-part warning's wording, or null — see the desktop editor. */
  protected strayLabel(row: ProductAttribute): string | null {
    if (this.status(row) !== 'stray-part') return null;
    const stray = strayPart(row.key, this.parts());
    return stray
      ? fillText(this.text.strayPart, {
          part: stray.part ?? '',
          key: stray.key,
        })
      : null;
  }

  /** The declared unit, or `'not-numeric'` — see the desktop editor. */
  protected valueMark(row: ProductAttribute): string | null {
    if (this.status(row) === 'not-numeric') return 'not-numeric';
    return this.unitOf(row);
  }

  protected unitOf(row: ProductAttribute): string | null {
    return (
      this.hintsByKey().get(attributeRowKey(row, this.parts()))?.unit ?? null
    );
  }

  protected open(index: number): void {
    this.opened = { ...this.rows()[index] };
    this.editing.set(index);
  }

  /** Closes the fields; the product's own save is what stores them. */
  protected commit(event: Event): void {
    event.preventDefault();
    this.editing.set(null);
  }

  protected cancel(): void {
    const index = this.editing();
    const before = this.opened;
    this.editing.set(null);
    if (index === null || !before) return;
    this.valueChange.emit(
      this.rows().map((row, i) => (i === index ? before : row)),
    );
  }

  protected edit(index: number, field: 'key' | 'value', text: string): void {
    this.valueChange.emit(
      this.rows().map((row, i) =>
        i === index ? { ...row, [field]: text } : row,
      ),
    );
  }

  protected addBelow(index: number): void {
    const rows = this.rows();
    if (rows.length >= PRODUCT_ATTRIBUTES_MAX) return;
    const next = [...rows];
    next.splice(index + 1, 0, { key: '', value: '' });
    this.valueChange.emit(next);
    // Straight into the row that was just made: an empty row nobody was sent to
    // is an empty row nobody fills.
    this.opened = { key: '', value: '' };
    this.editing.set(index + 1);
  }

  protected remove(index: number): void {
    this.editing.set(null);
    this.valueChange.emit(this.rows().filter((_, i) => i !== index));
  }

  protected onDrop(event: CdkDragDrop<ProductAttribute[]>): void {
    if (event.previousIndex === event.currentIndex) return;
    const rows = [...this.rows()];
    moveItemInArray(rows, event.previousIndex, event.currentIndex);
    this.valueChange.emit(rows);
  }
}
