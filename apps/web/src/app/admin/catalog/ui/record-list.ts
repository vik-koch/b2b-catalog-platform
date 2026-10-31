import {
  CdkDrag,
  CdkDragDrop,
  CdkDropList,
  moveItemInArray,
} from '@angular/cdk/drag-drop';
import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  computed,
  contentChild,
  input,
  output,
  TemplateRef,
} from '@angular/core';

/** `{ id: null }` is the add form. */
export type EditTarget = { id: string } | { id: null } | null;

export interface SortEntry {
  id: string;
  sortOrder: number;
}

/**
 * A short registry edited in place: rows dragged into order, one row at a
 * time swapped for the caller's form, the add form under the last. Rules, not
 * a card: the record list an admin grid draws on a phone.
 *
 *   <app-record-list [items]="…" [editing]="editing()" [locked]="busy()"
 *     [empty]="text.empty" (moved)="saveOrder($event)">
 *     <ng-template #row let-item>…</ng-template>
 *     <ng-template #editor>…</ng-template>
 *   </app-record-list>
 */
@Component({
  selector: 'app-record-list',
  imports: [CdkDrag, CdkDropList, NgTemplateOutlet],
  host: { class: 'block border-y border-edge' },
  template: `
    <ul
      class="divide-y divide-edge"
      cdkDropList
      [cdkDropListDisabled]="locked() || editing() !== null"
      (cdkDropListDropped)="drop($event)"
    >
      @for (item of items(); track item.id) {
        <!-- scroll-mt clears the sticky header, for a row linked to. -->
        <li
          class="scroll-mt-24 py-3"
          cdkDrag
          [cdkDragData]="item"
          [id]="rowId()?.(item) ?? null"
        >
          @if (editing()?.id === item.id) {
            <ng-container [ngTemplateOutlet]="editor()" />
          } @else {
            <ng-container
              [ngTemplateOutlet]="row()"
              [ngTemplateOutletContext]="{ $implicit: item }"
            />
          }
        </li>
      }
    </ul>
    @if (adding()) {
      <div class="py-3" [class]="items().length ? 'border-t border-edge' : ''">
        <ng-container [ngTemplateOutlet]="editor()" />
      </div>
    } @else if (!items().length) {
      <p class="py-3 text-sm text-ink-subtle">{{ empty() }}</p>
    }
  `,
})
export class RecordList<T extends { id: string }> {
  readonly items = input.required<readonly T[]>();
  readonly editing = input.required<EditTarget>();
  /** Holds the order still while something is being saved. */
  readonly locked = input(false);
  readonly empty = input.required<string>();
  /** An id for a row other pages link to. */
  readonly rowId = input<((item: T) => string) | null>(null);

  /** The new order, every row numbered: the drop is the save. */
  readonly moved = output<SortEntry[]>();

  protected readonly row = contentChild.required<TemplateRef<unknown>>('row');
  protected readonly editor =
    contentChild.required<TemplateRef<unknown>>('editor');
  protected readonly adding = computed(() => this.editing()?.id === null);

  protected drop(event: CdkDragDrop<T>): void {
    if (event.previousIndex === event.currentIndex) return;
    const ordered = [...this.items()];
    moveItemInArray(ordered, event.previousIndex, event.currentIndex);
    this.moved.emit(
      ordered.map((item, sortOrder) => ({ id: item.id, sortOrder })),
    );
  }
}
