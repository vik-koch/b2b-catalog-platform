import { Directive } from '@angular/core';

/** A record's key beside its name, in a row's title or on its card. */
@Directive({
  selector: 'span[uiGridKey]',
  host: {
    class: `max-w-full truncate rounded-sm bg-surface px-1.5 py-0.5 font-mono
            text-xs`,
  },
})
export class GridKey {}
