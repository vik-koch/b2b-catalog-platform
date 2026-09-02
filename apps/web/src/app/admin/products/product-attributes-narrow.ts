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
  PRODUCT_ATTRIBUTES_MAX,
  ProductAttribute,
} from '@b2b-catalog-platform/shared';
import { RouterLink } from '@angular/router';
import { ADMIN_TEXT } from '../../config/admin-text';
import { Button } from '../../ui/button';
import { FieldLabel } from '../../ui/field-label';
import { HintBadge } from '../../ui/hint-badge';
import { IconButton } from '../../ui/icon-button';
import { AdminIcon } from '../../ui/icons/admin-icon';
import { Input } from '../../ui/input';
import { RecordFields, RecordFormActions } from '../records/record-form';
import { RecordRow } from '../records/record-row';
import {
  AttributeHint,
  attributeIsKnown,
  attributeRowStatus,
} from './attribute-hints';

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
    AdminIcon,
    Button,
    HintBadge,
    IconButton,
    Input,
    FieldLabel,
    RecordFields,
    RecordFormActions,
    RecordRow,
    RouterLink,
    CdkDropList,
    CdkDrag,
    CdkDragHandle,
  ],
  template: `
    <ul
      class="max-w-xl divide-y divide-border border-y border-border"
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
            <form appRecordFields (submit)="commit($event)">
              <label class="block">
                <span appFieldLabel>{{ text.key }}</span>
                <input
                  appInput
                  size="sm"
                  class="w-full"
                  autocomplete="off"
                  [value]="row.key"
                  [placeholder]="text.key"
                  (input)="edit($index, 'key', $any($event.target).value)"
                />
              </label>
              <label class="block">
                <span appFieldLabel>{{ text.value }}</span>
                <input
                  appInput
                  size="sm"
                  class="w-full"
                  autocomplete="off"
                  [value]="row.value"
                  [placeholder]="unitOf(row) || text.value"
                  (input)="edit($index, 'value', $any($event.target).value)"
                />
              </label>
              <div appRecordFormActions>
                <button appButton size="sm" type="submit" class="gap-2">
                  <app-admin-icon name="save" class="h-4 w-4" />
                  {{ common.save }}
                </button>
                <button
                  appButton
                  variant="secondary"
                  size="sm"
                  type="button"
                  class="gap-2"
                  (click)="cancel()"
                >
                  <app-admin-icon name="x" class="h-4 w-4" />
                  {{ common.cancel }}
                </button>
              </div>
            </form>
          } @else {
            <app-record-row>
              <span
                class="font-medium break-words text-stone-700"
                [class.text-muted]="row.key.trim() === ''"
              >
                {{ row.key.trim() || text.key }}
              </span>
              <!-- The same fact the desktop grid marks over the key cell: the
                   shop filters by this name. Beside the key, because it is the
                   *key* that is filterable — pushed to the far end of the row
                   it read as a property of the buttons under it. -->
              @if (isFilterable(row)) {
                <app-hint-badge tone="neutral" [label]="text.filterable">
                  <app-admin-icon name="funnel" class="h-3.5 w-3.5" />
                </app-hint-badge>
              }
              <ng-container recordMeta>
                <span
                  class="break-words"
                  [class.text-muted]="!row.value.trim()"
                >
                  {{ row.value.trim() || dash }}
                </span>
                @if (valueMark(row); as mark) {
                  @if (mark === 'not-numeric') {
                    <app-hint-badge tone="warning" [label]="text.notNumeric">
                      <app-admin-icon
                        name="triangle-alert"
                        class="h-3.5 w-3.5"
                      />
                    </app-hint-badge>
                  } @else {
                    <span class="text-xs">{{ mark }}</span>
                  }
                }
              </ng-container>
              <ng-container recordActions>
                <!-- Where else this attribute is used, in the inventory: every
                     value in use under the key, with its counts, and the
                     product drill-down from there. A new tab on purpose —
                     leaving a half-edited product would trip the
                     unsaved-changes guard for what is only a glance. Kept in
                     place when the name is one nothing else carries, rather
                     than dropped: its being dead *is* that statement, and the
                     buttons beside it would otherwise shift as a key is
                     typed. -->
                @if (isKnown(row)) {
                  <a
                    appIconButton
                    target="_blank"
                    routerLink="/admin/attributes/inventory"
                    [queryParams]="{ key: row.key.trim() }"
                    [attr.aria-label]="text.showUsage"
                    [title]="text.showUsage"
                  >
                    <app-admin-icon name="square-menu" />
                  </a>
                } @else {
                  <span
                    appIconButton
                    aria-disabled="true"
                    class="pointer-events-none opacity-30"
                    [title]="linkHint(row)"
                    [attr.aria-label]="linkHint(row)"
                  >
                    <app-admin-icon name="square-menu" />
                  </span>
                }
                <button
                  appIconButton
                  type="button"
                  [attr.aria-label]="common.edit"
                  (click)="open($index)"
                >
                  <app-admin-icon name="pencil" />
                </button>
                <button
                  appIconButton
                  type="button"
                  [attr.aria-label]="text.add"
                  (click)="addBelow($index)"
                >
                  <app-admin-icon name="plus" />
                </button>
                <button
                  appIconButton
                  variant="danger"
                  type="button"
                  [attr.aria-label]="common.remove"
                  (click)="remove($index)"
                >
                  <app-admin-icon name="trash-2" />
                </button>
                <span
                  cdkDragHandle
                  appIconButton
                  class="cursor-grab active:cursor-grabbing"
                  [attr.aria-label]="common.reorder"
                >
                  <app-admin-icon name="grip-vertical" />
                </span>
              </ng-container>
            </app-record-row>
          }
        </li>
      }
    </ul>
  `,
})
export class ProductAttributesNarrow {
  protected readonly common = inject(ADMIN_TEXT).common;
  protected readonly text = inject(ADMIN_TEXT).productEditor.attributes;
  protected readonly dash = '—';

  readonly value = input.required<ProductAttribute[]>();
  readonly valueChange = output<ProductAttribute[]>();
  /** What the rest of the catalog carries, for the badges — the same list the
   * key picker above is built from. */
  readonly hints = input<readonly AttributeHint[]>([]);

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

  protected isFilterable(row: ProductAttribute): boolean {
    const status = attributeRowStatus(row, this.hintsByKey());
    return status === 'filterable' || status === 'not-numeric';
  }

  /** The declared unit, or `'not-numeric'` — see the desktop editor. */
  protected valueMark(row: ProductAttribute): string | null {
    if (attributeRowStatus(row, this.hintsByKey()) === 'not-numeric') {
      return 'not-numeric';
    }
    return this.unitOf(row);
  }

  /** Whether anything else in the catalog knows the name — no link if not. */
  protected isKnown(row: ProductAttribute): boolean {
    const hint = this.hintsByKey().get(row.key.trim());
    return hint !== undefined && attributeIsKnown(hint);
  }

  /** What the dead link says: why there is nothing behind it. */
  protected linkHint(row: ProductAttribute): string {
    return attributeRowStatus(row, this.hintsByKey()) === 'unknown'
      ? this.text.unknownKey
      : this.text.showUsage;
  }

  protected unitOf(row: ProductAttribute): string | null {
    return this.hintsByKey().get(row.key.trim())?.unit ?? null;
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
