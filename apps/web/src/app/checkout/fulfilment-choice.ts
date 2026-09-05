import { Component, inject, input, output, signal } from '@angular/core';
import { FulfilmentMethod } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { ChoiceCard } from '../ui/choice-card';
import { DeliveryConditionsDialog } from './delivery-conditions-dialog';
import { Link } from '../ui/link';

/**
 * How the goods arrive (FR-CART-07) — the row that leads the form, because it
 * decides most of what follows it: delivery asks for an address, pickup asks
 * which office. Both of those stand *under* this row rather than inside a
 * card, so whichever is revealed occupies the same place on the page.
 *
 * Only what a *choice means* is app text. The zones the conditions dialog
 * lists and the offices the pickup section offers are deployment
 * configuration — a deployment describes its own offices, it does not
 * re-explain what delivery is.
 *
 * Pickup is offered only where offices are configured: a deployment with none
 * has nowhere to collect from, and the choice could not be completed.
 */
@Component({
  selector: 'app-fulfilment-choice',
  imports: [ChoiceCard, DeliveryConditionsDialog, Link],
  // Block, or the page's own spacing between sections cannot reach it: a
  // margin on an inline element does nothing.
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-3 font-medium">{{ text.heading }}</legend>

      <div
        class="grid gap-3"
        [class.sm:grid-cols-2]="hasPickup"
        role="radiogroup"
      >
        <app-choice-card
          name="fulfilment"
          value="delivery"
          [title]="text.deliveryTitle"
          [checked]="method() === 'delivery'"
          (chosen)="methodChange.emit('delivery')"
        >
          <!-- Only where the deployment describes zones: a dialog listing
               nothing is a link that answers no question. -->
          @if (hasZones) {
            <!-- Block, not the inline-block a button is by default: on a
                 text baseline it carries the line box's leading with it, and
                 sits a few pixels lower than the sentence the other card
                 prints in the same place. -->
            <button
              type="button"
              appLink
              class="block text-sm"
              (click)="showConditions.set(true)"
            >
              {{ text.conditionsLink }}
            </button>
          }
        </app-choice-card>

        @if (hasPickup) {
          <app-choice-card
            name="fulfilment"
            value="pickup"
            [title]="text.pickupTitle"
            [description]="text.pickupDescription"
            [checked]="method() === 'pickup'"
            (chosen)="methodChange.emit('pickup')"
          />
        }
      </div>
    </fieldset>

    @if (showConditions()) {
      <app-delivery-conditions-dialog (closed)="showConditions.set(false)" />
    }
  `,
})
export class FulfilmentChoice {
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(APP_TEXT).checkout.fulfilment;
  protected readonly hasPickup =
    (this.config.pickup?.locations.length ?? 0) > 0;
  protected readonly hasZones = (this.config.delivery?.zones.length ?? 0) > 0;

  protected readonly showConditions = signal(false);

  readonly method = input.required<FulfilmentMethod>();
  readonly methodChange = output<FulfilmentMethod>();
}
