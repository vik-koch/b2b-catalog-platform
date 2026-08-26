import { Component, inject, input, output } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Radio } from '../ui/radio';

/**
 * Which point the order is collected from — pickup's answer to the delivery
 * address, standing in the same place on the page as one, so choosing the
 * other fulfilment swaps one section for the other.
 *
 * Plain radios, with no frame and no rule between them. The cards above
 * explain a choice that shapes the rest of the form; this one only names
 * places, and a shop with half a dozen collection points would be a wall of
 * boxes. A line each: what it is called, where it is, when it is open.
 *
 * The map is an ordinary link to somewhere else, not an embed — it is looked
 * up before ever reaching this form, and a map drawn into the page is a great
 * deal of weight for that.
 */
@Component({
  selector: 'app-pickup-choice',
  imports: [Radio],
  // Block, or the page's own spacing between sections cannot reach it: a
  // margin on an inline element does nothing.
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-2 font-medium">{{ text.pickupHeading }}</legend>

      <div class="space-y-2" role="radiogroup">
        @for (location of locations; track location.key) {
          <div class="flex flex-wrap items-baseline gap-x-4">
            <!-- The link stays outside the label: a label wrapping it would
                 take the click meant for the map. -->
            <label class="flex cursor-pointer items-baseline gap-2">
              <input
                type="radio"
                appRadio
                class="self-center"
                name="pickup-location"
                [value]="location.key"
                [checked]="pickupKey() === location.key"
                (change)="pickupKeyChange.emit(location.key)"
              />
              <span class="flex flex-wrap items-baseline gap-x-4">
                <span>{{ location.name }}</span>
                <span class="text-sm text-muted">{{ location.address }}</span>
                @if (location.description) {
                  <span class="text-sm text-subtle">
                    {{ location.description }}
                  </span>
                }
              </span>
            </label>
            @if (location.mapUrl) {
              <a
                class="text-sm text-accent hover:underline"
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
    </fieldset>
  `,
})
export class PickupChoice {
  protected readonly text = inject(APP_TEXT).checkout.fulfilment;
  protected readonly locations =
    inject(DEPLOYMENT_CONFIG).pickup?.locations ?? [];

  readonly pickupKey = input.required<string | null>();
  readonly pickupKeyChange = output<string>();
}
