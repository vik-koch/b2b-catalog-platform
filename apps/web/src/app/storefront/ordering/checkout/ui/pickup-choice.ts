import { Component, inject, input, output } from '@angular/core';

import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { Radio } from '@b2b-catalog-platform/ui/choices/radio';
import { EmphasisedText } from '@b2b-catalog-platform/ui/content/emphasised-text';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';

import { ORDERING_CONFIG } from '../../../../core/ordering/ordering-config';
import { STOREFRONT_ORDERING_TEXT } from '../../ordering-text';

/** The collection point, in the place the delivery address takes. Plain radios:
 * a shop may have many. The map is a link, not an embed. */
@Component({
  selector: 'app-pickup-choice',
  imports: [EmphasisedText, Radio, TextButton, ErrorText],
  // Block, so the page's section spacing applies.
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-2 font-medium">{{ text.pickupHeading }}</legend>

      <div
        class="space-y-2"
        role="radiogroup"
        [attr.aria-invalid]="invalid() || null"
        [attr.aria-describedby]="invalid() ? 'pickup-error' : null"
      >
        @for (location of locations; track location.key) {
          <!-- Radio, place, map link; the link keeps its column, wrapping under
               only when narrow. Centred, as a two-line place centres on the
               radio. -->
          <div class="flex flex-wrap items-center justify-between gap-x-4">
            <!-- Outside the label, which would take the map's click. -->
            <label class="flex flex-1 cursor-pointer items-baseline gap-2">
              <input
                type="radio"
                uiRadio
                class="self-center"
                name="pickup-location"
                [value]="location.key"
                [checked]="pickupKey() === location.key"
                (change)="pickupKeyChange.emit(location.key)"
              />
              <span class="flex flex-wrap items-baseline gap-x-4">
                <span>{{ location.name }}</span>
                <span class="text-sm text-ink-subtle">{{
                  location.address
                }}</span>
                @if (location.description) {
                  <span class="text-sm text-ink-subtle">
                    <ui-emphasised [text]="location.description" />
                  </span>
                }
              </span>
            </label>
            @if (location.mapUrl) {
              <a
                uiTextButton
                class="shrink-0 text-sm"
                target="_blank"
                rel="noopener noreferrer"
                [href]="location.mapUrl"
              >
                {{ text.mapLink }}
              </a>
            }
          </div>
        }
      </div>

      @if (invalid()) {
        <p id="pickup-error" uiErrorText class="mt-2">
          {{ text.pickupRequired }}
        </p>
      }
    </fieldset>
  `,
})
export class PickupChoice {
  protected readonly text = inject(STOREFRONT_ORDERING_TEXT).checkout
    .fulfilment;
  protected readonly locations =
    inject(ORDERING_CONFIG).pickup?.locations ?? [];

  readonly pickupKey = input.required<string | null>();
  /** Set after a submit with no answer: the group is no form field. */
  readonly invalid = input(false);
  readonly pickupKeyChange = output<string>();
}
