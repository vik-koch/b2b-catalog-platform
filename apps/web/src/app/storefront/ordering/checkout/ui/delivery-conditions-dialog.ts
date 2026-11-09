import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  output,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { DialogPanel } from '@b2b-catalog-platform/ui/overlay/dialog-panel';
import { DialogTitle } from '@b2b-catalog-platform/ui/overlay/dialog-title';

import { SITE_CONFIG } from '../../../../core/site/site-config';
import { DEPLOYMENT_CONFIG } from '../../../../platform/config/deployment-config';
import { SHARED_TEXT } from '../../../../platform/config/shared-text';
import { STOREFRONT_ORDERING_TEXT } from '../../ordering-text';
import { DeliveryZoneList } from './delivery-zone-list';

/** Where the deployment delivers and the free-delivery minimums (FR-CART-07). A
 * dialog, so the customer keeps their place in the form; it links to the
 * conditions page for the rest. */
@Component({
  selector: 'app-delivery-conditions-dialog',
  imports: [
    DialogTitle,
    Button,
    DeliveryZoneList,
    DialogPanel,
    RouterLink,
    TextButton,
  ],
  template: `
    <dialog
      #dialog
      size="lg"
      uiDialogPanel
      aria-labelledby="delivery-conditions-heading"
      (cancel)="closed.emit()"
    >
      <h2 id="delivery-conditions-heading" uiDialogTitle>
        {{ text.conditionsHeading }}
      </h2>

      <app-delivery-zone-list class="mt-4" />

      <p class="mt-4 text-sm text-ink-subtle">{{ text.conditionsNote }}</p>

      <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
        @if (conditionsPath) {
          <a
            uiTextButton
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
          uiButton
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
  private readonly siteConfig = inject(SITE_CONFIG);

  protected readonly text = inject(STOREFRONT_ORDERING_TEXT).checkout
    .fulfilment;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  /** Only where the page is published, or the link is a 404. */
  protected readonly conditionsPath = (
    this.siteConfig.pages.published as readonly string[]
  ).includes('conditions')
    ? '/conditions'
    : null;

  readonly closed = output<void>();

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }
}
