import {
  CdkDrag,
  CdkDragDrop,
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
import { fillText } from '@b2b-catalog-platform/shared';
import { ProductAttribute } from '@b2b-catalog-platform/shared/core/catalog';
import { PRODUCT_ATTRIBUTES_MAX } from '@b2b-catalog-platform/shared/admin/catalog';
import { ADMIN_TEXT } from '../../../shared/config/admin-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { FieldLabel } from '@b2b-catalog-platform/ui/fields/field-label';
import { HintBadge } from '@b2b-catalog-platform/ui/content/hint-badge';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Input } from '@b2b-catalog-platform/ui/inputs/input';
import { RecordFields } from '@b2b-catalog-platform/ui/lists/record-fields';
import { RecordFormActions } from '@b2b-catalog-platform/ui/lists/record-form-actions';
import { RecordRow } from '@b2b-catalog-platform/ui/lists/record-row';
import { AttributeRowMarks } from './attribute-hints';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { funnelIcon } from '@b2b-catalog-platform/ui/icons/glyphs/funnel';
import { pencilIcon } from '@b2b-catalog-platform/ui/icons/glyphs/pencil';
import { plusIcon } from '@b2b-catalog-platform/ui/icons/glyphs/plus';
import { saveIcon } from '@b2b-catalog-platform/ui/icons/glyphs/save';
import { trash2Icon } from '@b2b-catalog-platform/ui/icons/glyphs/trash-2';
import { triangleAlertIcon } from '@b2b-catalog-platform/ui/icons/glyphs/triangle-alert';
import { DragGrip } from '../ui/drag-grip';
import { CancelButton } from '../../ui/cancel-button';

/**
 * The product's attributes on a phone (FR-CAT-05), where the spreadsheet's
 * selection and clipboard need a pointer and a keyboard. The admin's record
 * list instead: read first, a pencil opens one row as fields, and the
 * product's own save stores it.
 */
@Component({
  selector: 'app-product-attributes-narrow',
  imports: [
    CancelButton,
    DragGrip,
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
          @let mark = marks()[$index];
          @if (editing() === $index) {
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
                  [placeholder]="mark?.unit || text.value"
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
                  appCancelButton
                  size="sm"
                  type="button"
                  (click)="cancel()"
                >
                  {{ actionText.cancel }}
                </button>
              </div>
            </form>
          } @else {
            <ui-record-row>
              <app-drag-grip recordControl size="lead" />
              <span
                class="font-medium wrap-break-word text-ink"
                [class.text-ink-subtle]="row.key.trim() === ''"
              >
                {{ row.key.trim() || text.key }}
              </span>
              <!-- Beside the key: it is the key the shop filters by. -->
              @if (mark?.stray; as stray) {
                <ui-hint-badge tone="warning" [label]="strayLabel(stray)">
                  <ui-icon [glyph]="triangleAlertIcon" class="size-3.5" />
                </ui-hint-badge>
              }
              @if (mark?.filterable) {
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
                @if (mark?.notNumeric) {
                  <ui-hint-badge tone="warning" [label]="text.notNumeric">
                    <ui-icon [glyph]="triangleAlertIcon" class="size-3.5" />
                  </ui-hint-badge>
                } @else if (mark?.unit) {
                  <span class="text-xs">{{ mark?.unit }}</span>
                }
              </ng-container>
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
  protected readonly pencilIcon = pencilIcon;
  protected readonly plusIcon = plusIcon;
  protected readonly saveIcon = saveIcon;
  protected readonly trash2Icon = trash2Icon;
  protected readonly triangleAlertIcon = triangleAlertIcon;
  protected readonly adminText = inject(ADMIN_TEXT);
  protected readonly text = inject(ADMIN_TEXT).products.editor.attributes;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly dash = '—';

  readonly value = input.required<ProductAttribute[]>();
  readonly valueChange = output<ProductAttribute[]>();
  /** One per row, as the editor reads them. */
  readonly marks = input<readonly AttributeRowMarks[]>([]);

  protected readonly editing = signal<number | null>(null);
  /** The open row as it stood, for cancel: editing writes straight through,
   * so the fields show what was typed. */
  private opened: ProductAttribute | null = null;

  /** At least one empty row, as the grid has. */
  protected readonly rows = computed<ProductAttribute[]>(() =>
    this.value().length > 0 ? this.value() : [{ key: '', value: '' }],
  );

  protected strayLabel(stray: { part: string; key: string }): string {
    return fillText(this.text.strayPart, stray);
  }

  protected open(index: number): void {
    this.opened = { ...this.rows()[index] };
    this.editing.set(index);
  }

  /** The product's own save stores the row. */
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
    // An empty row nobody is sent to is one nobody fills.

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
