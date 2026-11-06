import { Directive } from '@angular/core';

/** The link inside a `ui-grid-title`: the record's name, set for the row. */
@Directive({
  selector: 'a[uiGridTitleLink]',
  host: {
    class:
      'align-middle font-medium text-ink hover:text-accent [word-spacing:normal]',
  },
})
export class GridTitleLink {}
