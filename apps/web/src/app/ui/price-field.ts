import { Directive, inject } from '@angular/core';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { isPartialPrice } from '../catalog/price';

/**
 * Keeps a price field to what a price can look like.
 *
 * `type="number"` cannot be used here: a browser reports a half-typed "18." as
 * an *empty* value, so a bound signal wipes the field the moment the decimal
 * separator is pressed. A plain text input fixes that and gives up the
 * restriction, which this puts back — and puts back better, since it also
 * enforces the deployment currency's precision and accepts either separator.
 *
 * Refusal happens at `beforeinput`, so the rejected character never reaches the
 * field and the caret never moves: nothing to undo, nothing to re-render, no
 * error message for a keystroke that simply does not apply. Deletions and
 * anything without inserted text pass untouched.
 */
@Directive({
  selector: 'input[appPriceField]',
  host: { '(beforeinput)': 'onBeforeInput($event)' },
})
export class PriceField {
  private readonly currency = inject(DEPLOYMENT_CONFIG).catalog.currency;

  protected onBeforeInput(event: InputEvent): void {
    // Paste carries its text on the dataTransfer instead of `data`; a null
    // both ways is a deletion or a composition end, which can only shorten or
    // replace what is already valid.
    const inserted = event.data ?? event.dataTransfer?.getData('text') ?? null;
    if (inserted === null) return;

    const input = event.target as HTMLInputElement;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    const next =
      input.value.slice(0, start) + inserted + input.value.slice(end);

    if (!isPartialPrice(next, this.currency)) event.preventDefault();
  }
}
