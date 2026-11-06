import { Component, computed, inject, input, model } from '@angular/core';
import type { FormCheckboxControl } from '@angular/forms/signals';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { Checkbox } from '@b2b-catalog-platform/ui/choices/checkbox';
import { TickLabel } from '@b2b-catalog-platform/ui/choices/tick-label';
import { STOREFRONT_ACCOUNTS_TEXT } from '../../accounts-text';

/**
 * The offer to skip the second sign-in step on this browser for `days`. Takes
 * a form field (`[formField]`) or a plain `[(checked)]`.
 */
@Component({
  selector: 'app-remember-browser',
  imports: [Checkbox, TickLabel],
  host: { class: 'block' },
  template: `
    <label uiTickLabel>
      <input
        uiCheckbox
        type="checkbox"
        [checked]="checked()"
        (change)="checked.set($any($event.target).checked)"
        aria-describedby="rememberBrowserHint"
      />
      <span>{{ label() }}</span>
    </label>
    <p id="rememberBrowserHint" class="mt-1 pl-6 text-sm text-ink-subtle">
      {{ text.rememberHint }}
    </p>
  `,
})
export class RememberBrowser implements FormCheckboxControl {
  readonly days = input.required<number>();
  readonly checked = model(false);

  protected readonly text = inject(STOREFRONT_ACCOUNTS_TEXT).auth.signInStep;
  protected readonly label = computed(() =>
    fillText(this.text.remember, { days: this.days() }),
  );
}
