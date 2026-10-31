import { Directive } from '@angular/core';

/**
 * The line that opens a `<details>` row in a list: its facts wrap as words do,
 * and the whole padded row is the target.
 *
 *   <details>
 *     <summary uiDetailsSummary><span>{{ name }}</span> …</summary>
 *     …
 *   </details>
 */
@Directive({
  selector: 'summary[uiDetailsSummary]',
  host: {
    class: `flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 py-3
            outline-offset-2
            hover:text-accent`,
  },
})
export class DetailsSummary {}
