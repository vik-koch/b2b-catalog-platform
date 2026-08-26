import { Component, inject } from '@angular/core';
import { FulfilmentMethod } from '@b2b-catalog-platform/shared';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { CartService } from '../cart/cart.service';
import { usePageSeo } from '../core/page-seo';
import { Button } from '../ui/button';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { CheckoutDraftService } from './checkout-draft.service';
import { FulfilmentChoice } from './fulfilment-choice';
import { PickupChoice } from './pickup-choice';

/**
 * The checkout form (FR-CART-03/04/07/09): one screen covering how the goods
 * arrive, who is invoiced and where, when it is wanted and how it is paid —
 * followed by a preview of the whole order and a send button.
 *
 * One form rather than a wizard because every question here has a working
 * default, so for most orders it arrives answered and the customer is reading
 * it back rather than filling it in. A column of a single width, like the
 * address form it borrows most of its fields from.
 *
 * Every answer lives in the draft, not in this component: the customer can go
 * back to the cart to fix a line and return to a form still holding what they
 * said.
 */
@Component({
  selector: 'app-checkout-page',
  imports: [Button, FulfilmentChoice, PickupChoice, RouterLink],
  template: `
    <div class="max-w-4xl">
      <h1 class="mb-2 text-3xl font-bold tracking-tight">{{ text.title }}</h1>

      @if (cart.isEmpty()) {
        <p class="text-subtle">{{ text.emptyCart }}</p>
        <a appButton routerLink="/cart" class="mt-4">{{ cartText.navLabel }}</a>
      } @else {
        <p class="mb-8 text-muted">{{ text.intro }}</p>

        <div class="space-y-4">
          <app-fulfilment-choice
            [method]="draft().fulfilmentMethod"
            (methodChange)="chooseFulfilment($event)"
          />

          <!-- Pickup's answer to the delivery address, in the place the
               address will stand for delivery. -->
          @if (draft().fulfilmentMethod === 'pickup') {
            <app-pickup-choice
              [pickupKey]="draft().pickupLocationKey"
              (pickupKeyChange)="drafts.patch({ pickupLocationKey: $event })"
            />
          }
        </div>

        <div class="mt-10 flex flex-wrap items-center gap-3">
          <a appButton variant="secondary" routerLink="/cart">
            {{ cartText.navLabel }}
          </a>
        </div>
      }
    </div>
  `,
})
export class CheckoutPage {
  protected readonly cart = inject(CartService);
  protected readonly drafts = inject(CheckoutDraftService);
  protected readonly draft = this.drafts.draft;

  private readonly locations =
    inject(DEPLOYMENT_CONFIG).pickup?.locations ?? [];

  protected readonly text = inject(APP_TEXT).checkout;
  protected readonly cartText = inject(APP_TEXT).cart;

  constructor() {
    usePageSeo({ name: () => this.text.title });
  }

  /**
   * Choosing pickup where there is one office chooses it too: a list of one is
   * not a question, and leaving it unanswered would fail a submission over a
   * choice the customer was never really given.
   */
  protected chooseFulfilment(method: FulfilmentMethod): void {
    const only = this.locations.length === 1 ? this.locations[0].key : null;
    this.drafts.patch({
      fulfilmentMethod: method,
      ...(method === 'pickup' && this.draft().pickupLocationKey === null && only
        ? { pickupLocationKey: only }
        : {}),
    });
  }
}
