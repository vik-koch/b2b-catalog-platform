import { Directive, inject, input, TemplateRef } from '@angular/core';
import { GridRowContext } from './grid-row-template';

/**
 * A row drawn as a record (`uiGridCard`), for the narrow list. A template of
 * its own: which fields matter there is the page's judgement, not a rule.
 */
@Directive({ selector: 'ng-template[uiGridCard]' })
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
