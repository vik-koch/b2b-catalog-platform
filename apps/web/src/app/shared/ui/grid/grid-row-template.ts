import { Directive, inject, input, TemplateRef } from '@angular/core';

/** What a row template is handed: the record it draws. */
export interface GridRowContext<T> {
  $implicit: T;
}

/**
 * The `<td>`s of one row, written by the page:
 *
 *   <ng-template appGridRow [of]="data.items" let-order>
 *     <td>…</td>
 *   </ng-template>
 *
 * `of` is never read: it lets the compiler infer `let-order`, which a content
 * template cannot borrow from its host. One template, not one per column, so
 * a page can write a colspan; a spec holds the cell count to the columns.
 */
@Directive({ selector: 'ng-template[appGridRow]' })
export class GridRowTemplate<T> {
  readonly of = input.required<readonly T[]>();
  readonly template = inject<TemplateRef<GridRowContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _directive: GridRowTemplate<T>,
    _context: unknown,
  ): _context is GridRowContext<T> {
    return true;
  }
}
