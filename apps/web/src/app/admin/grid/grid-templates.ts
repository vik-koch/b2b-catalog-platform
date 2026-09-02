import { Directive, inject, input, TemplateRef } from '@angular/core';

/** What a row template is handed: the record it draws. */
export interface GridRowContext<T> {
  $implicit: T;
}

/**
 * The `<td>`s of one table row, authored by the page:
 *
 *   <ng-template appGridRow [of]="data.items" let-order>
 *     <td>…</td>
 *   </ng-template>
 *
 * `of` is bound to the very array the grid is given and is never read: it is
 * there so the compiler can infer what `let-order` is. A content template
 * cannot borrow its host component's type parameter, and under strictTemplates
 * an uninferred row is `unknown` — so every cell would need a cast, which is
 * exactly the safety this refactor is meant to keep.
 *
 * The cells are the page's rather than one template per column, because a page
 * that wants a colspan, or two values in one cell, can write it — and because
 * the alternative is six templates whose order is a hidden contract anyway.
 * That the count matches the declared columns is what a spec asserts.
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

/**
 * The same record drawn for a phone (`appCard`), where the grid is a list and
 * not a table — the fields worth carrying, read down instead of across.
 *
 * A second template rather than a rule that folds columns together: which three
 * of nine fields matter on a phone is a judgement about the screen, and no
 * generic rule makes "reference, customer and total" out of a column list.
 */
@Directive({ selector: 'ng-template[appGridCard]' })
export class GridCardTemplate<T> {
  readonly of = input.required<readonly T[]>();
  readonly template = inject<TemplateRef<GridRowContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _directive: GridCardTemplate<T>,
    _context: unknown,
  ): _context is GridRowContext<T> {
    return true;
  }
}
