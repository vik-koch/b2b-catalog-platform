import { Directive, inject, input, TemplateRef } from '@angular/core';
import { GridRowContext } from './grid-row-template';

/**
 * The record of an `appGridRow` drawn for a phone (`appCard`), where the grid
 * is a list and not a table — the fields worth carrying, read down instead of
 * across.
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
