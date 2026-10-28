import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { DialogPanel } from '@b2b-catalog-platform/ui/overlay/dialog-panel';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { DeliveryZoneList } from './delivery-zone-list';
import { SHARED_TEXT } from '../../shared/config/shared-text';

/**
 * Where this deployment delivers, and what an order has to reach for delivery
 * inside a zone to be free (FR-CART-07).
 *
 * A dialog rather than a page, because it is read *during* checkout: sending
 * somebody to the conditions page mid-form is asking them to come back and
 * find their place again. The page draws the same zone list; this links there
 * for the pickup points, the payment rule and the shop's own prose.
 */
@Component({
  selector: 'app-delivery-conditions-dialog',
  imports: [Button, DeliveryZoneList, DialogPanel, RouterLink, TextButton],
  template: `
    <dialog
      #dialog
      size="lg"
      appDialogPanel
      aria-labelledby="delivery-conditions-heading"
      (cancel)="closed.emit()"
    >
      <h2
        id="delivery-conditions-heading"
        class="text-xl font-normal tracking-tight"
      >
        {{ text.conditionsHeading }}
      </h2>

      <app-delivery-zone-list class="mt-4" />

      <p class="mt-4 text-sm text-ink-subtle">{{ text.conditionsNote }}</p>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
        @if (conditionsPath) {
          <a
            appTextButton
            class="text-sm"
            [routerLink]="conditionsPath"
            (click)="closed.emit()"
          >
            {{ text.conditionsMore }}
          </a>
        } @else {
          <span></span>
        }
        <button
          appButton
          variant="secondary"
          type="button"
          (click)="closed.emit()"
        >
          {{ actionText.close }}
        </button>
      </div>
    </dialog>
  `,
})
export class DeliveryConditionsDialog {
  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(STOREFRONT_TEXT).checkout.fulfilment;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  /** Only where the deployment publishes the page — an unpublished slug is a
   * 404, and the dialog would be linking checkout into one. */
  protected readonly conditionsPath = (
    this.config.pages.published as readonly string[]
  ).includes('conditions')
    ? '/conditions'
    : null;

  readonly closed = output<void>();

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }
}
