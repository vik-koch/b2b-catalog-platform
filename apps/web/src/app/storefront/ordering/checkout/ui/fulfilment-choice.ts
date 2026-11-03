import { Component, inject, input, output, signal } from '@angular/core';
import { FulfilmentMethod } from '@b2b-catalog-platform/shared/core/ordering';
import { STOREFRONT_TEXT } from '../../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../../shared/config/deployment-config';
import { ChoiceCard } from '@b2b-catalog-platform/ui/choices/choice-card';
import { DeliveryConditionsDialog } from './delivery-conditions-dialog';
import { Link } from '@b2b-catalog-platform/ui/actions/link';

/** How the goods arrive (FR-CART-07). First, as it decides what follows; the
 * address or pickup row stands under it, so either takes the same place. Pickup
 * only where offices are configured. */
@Component({
  selector: 'app-fulfilment-choice',
  imports: [ChoiceCard, DeliveryConditionsDialog, Link],
  // Block, so the page's section spacing applies.
  host: { class: 'block' },
  template: `
    <fieldset>
      <legend class="mb-3 font-medium">{{ text.heading }}</legend>

      <div
        class="grid gap-3"
        [class.sm:grid-cols-2]="hasPickup"
        role="radiogroup"
      >
        <ui-choice-card
          name="fulfilment"
          value="delivery"
          [title]="names.delivery"
          [checked]="method() === 'delivery'"
          (chosen)="methodChange.emit('delivery')"
        >
          <!-- Only where the deployment describes zones. -->
          @if (hasZones) {
            <!-- Block: inline-block on a text baseline sits a few pixels below
                 the other card's sentence. -->
            <button
              type="button"
              uiLink
              class="block text-sm"
              (click)="showConditions.set(true)"
            >
              {{ text.conditionsLink }}
            </button>
          }
        </ui-choice-card>

        @if (hasPickup) {
          <ui-choice-card
            name="fulfilment"
            value="pickup"
            [title]="names.pickup"
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

  protected readonly text = inject(STOREFRONT_TEXT).checkout.fulfilment;
  protected readonly names = inject(SHARED_TEXT).fulfilment;
  protected readonly hasPickup =
    (this.config.pickup?.locations.length ?? 0) > 0;
  protected readonly hasZones = (this.config.delivery?.zones.length ?? 0) > 0;

  protected readonly showConditions = signal(false);

  readonly method = input.required<FulfilmentMethod>();
  readonly methodChange = output<FulfilmentMethod>();
}
