import { Directive, inject, input, TemplateRef } from '@angular/core';
import { SuggestList } from '../core/suggest-list';

/** What a row template is handed: the suggestion it draws. */
export interface SuggestRowContext<T> {
  readonly $implicit: T;
  /** The settled query the row answered, for HighlightedLine. */
  readonly query: string;
}

/**
 * What one SuggestField row draws:
 *
 *   <ng-template appSuggestRow [of]="list" let-item let-query="query">…</ng-template>
 *
 * `of` is the field's own list and is never read: it is there so the compiler
 * can infer what `let-item` is.
 */
@Directive({ selector: 'ng-template[appSuggestRow]' })
export class SuggestRow<T> {
  readonly of = input.required<SuggestList<T>>();
  readonly template = inject<TemplateRef<SuggestRowContext<T>>>(TemplateRef);

  static ngTemplateContextGuard<T>(
    _directive: SuggestRow<T>,
    _context: unknown,
  ): _context is SuggestRowContext<T> {
    return true;
  }
}
