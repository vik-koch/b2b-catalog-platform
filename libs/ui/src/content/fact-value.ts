import { Directive } from '@angular/core';

/** The value under or beside its `uiFactTerm`. */
@Directive({
  selector: 'dd[uiFactValue]',
  host: { class: 'min-w-0 even:mb-3 last:mb-0' },
})
export class FactValue {}
