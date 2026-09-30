import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { Button } from '../ui/button';
import { DialogPanel } from '../ui/dialog-panel';
import { Link } from '../ui/link';
import { DeliveryZoneList } from './delivery-zone-list';

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
  imports: [Button, DeliveryZoneList, DialogPanel, RouterLink, Link],
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

      <p class="mt-4 text-sm text-subtle">{{ text.conditionsNote }}</p>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
        @if (conditionsPath) {
          <a
            appLink
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
          {{ text.close }}
        </button>
      </div>
    </dialog>
  `,
})
export class DeliveryConditionsDialog {
  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(APP_TEXT).checkout.fulfilment;
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
