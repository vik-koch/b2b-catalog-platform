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
import { formatPriceMinor } from '../catalog/price';
import { Button } from '../ui/button';
import { DialogPanel } from '../ui/dialog-panel';
import { fillText } from '@b2b-catalog-platform/shared';
import { Link } from '../ui/link';

/**
 * Where this deployment delivers, and what an order has to reach for delivery
 * inside a zone to be free (FR-CART-07).
 *
 * A dialog rather than a page, because it is read *during* checkout: sending
 * somebody to the conditions page mid-form is asking them to come back and
 * find their place again. What is here is the summary; the binding long form
 * stays on the admin-editable conditions page, which this links to — one
 * summary and one authority, rather than two copies of the same rules.
 */
@Component({
  selector: 'app-delivery-conditions-dialog',
  imports: [Button, DialogPanel, RouterLink, Link],
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

      <ul class="mt-4 space-y-3">
        @for (zone of zones; track zone.key) {
          <li class="rounded-lg border border-border p-4">
            <p class="font-medium">{{ zone.title }}</p>
            @if (zone.description) {
              <p class="mt-1 text-sm text-muted">{{ zone.description }}</p>
            }
            <!-- Said out loud either way: a zone with no line under it would
                 read as an unstated free threshold rather than none. -->
            <p class="mt-2 text-sm text-subtle">{{ threshold(zone) }}</p>
          </li>
        }
      </ul>

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
  private readonly currency = this.config.catalog.currency;

  protected readonly text = inject(APP_TEXT).checkout.fulfilment;
  protected readonly zones = this.config.delivery?.zones ?? [];
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

  protected threshold(zone: { readonly freeFromMinor?: number }): string {
    return zone.freeFromMinor === undefined
      ? this.text.noFreeDelivery
      : fillText(this.text.freeFrom, {
          amount: formatPriceMinor(zone.freeFromMinor, this.currency),
        });
  }
}
