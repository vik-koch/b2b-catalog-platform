import {
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  canTransition,
  ORDER_STATUS_REASON_MAX,
  OrderDetail,
} from '@b2b-catalog-platform/shared/core/ordering';
import { fillText } from '@b2b-catalog-platform/shared';
import { OrderSummary } from '../../../core/ordering/ui/order-summary';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { usePageSeo } from '../../../shared/core/page-seo';
import { NotFoundView } from '../../platform/not-found-view';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import {
  confirmRequest,
  ConfirmService,
} from '@b2b-catalog-platform/ui/overlay/confirm.service';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { OrderDocumentsList } from './ui/order-documents-list';
import { OrderReadBack } from '../../../core/ordering/ui/order-read-back';
import { OrderHeading } from './ui/order-heading';
import { useCustomerOrderView } from './customer-order-view';
import { OrdersService } from './orders.service';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';

/**
 * One of the account's own orders (FR-ACC-01). Read-only but for calling it
 * off while the shop has not started on it (FR-ORD-02).
 */
@Component({
  selector: 'app-order-detail-page',
  imports: [
    RouterLink,
    Button,
    NotFoundView,
    Skeleton,
    OrderDocumentsList,
    OrderReadBack,
    OrderSummary,
    OrderHeading,
    ErrorText,
  ],
  template: `
    @if (detail(); as detail) {
      <!-- The cart's two columns at the cart's notch, measured on the page,
           so the card sits where it sat on the cart and checkout. -->
      <div class="@container/order">
        <div
          class="grid gap-10
                 @min-[63.75rem]/order:grid-cols-[36rem_20rem]
                 @min-[63.75rem]/order:justify-between"
        >
          <div class="max-w-xl">
            <app-order-heading [order]="detail" />

            <app-order-read-back
              class="mt-8"
              [lines]="lines()"
              [blocks]="blocks()"
            />
          </div>

          <aside
            class="max-w-xl
                   @min-[63.75rem]/order:mt-9 @min-[63.75rem]/order:sticky
                   @min-[63.75rem]/order:top-20
                   @min-[63.75rem]/order:self-start"
          >
            <app-order-summary
              [lineCount]="detail.lines.length"
              [subtotalMinor]="detail.totalMinor"
              [shipment]="detail.shipment"
              [taxRates]="taxRates()"
              [taxBasis]="detail.taxBasis"
            />
            @if (detail.documents.length) {
              <app-order-documents-list
                class="mt-5"
                [documents]="detail.documents"
                [by]="{ reference: detail.reference }"
              />
            }

            @if (cancellable()) {
              <button
                uiButton
                variant="dangerOutline"
                type="button"
                class="mt-5 w-full"
                [disabled]="cancelling()"
                (click)="cancel(detail)"
              >
                {{ text.cancel.action }}
              </button>
            }
            @if (cancelFailed()) {
              <p uiErrorText class="mt-3" role="alert">
                {{ text.cancel.error }}
              </p>
            }
            <a
              uiButton
              variant="secondary"
              routerLink="/account/orders"
              class="mt-5 w-full"
            >
              {{ text.backToList }}
            </a>
          </aside>
        </div>
      </div>
    } @else if (missing()) {
      <app-not-found-view
        [body]="text.notFound"
        backLink="/account/orders"
        [backLabel]="text.backToList"
      />
    } @else if (order.error()) {
      <p uiErrorText role="alert">{{ text.error }}</p>
      <a uiButton variant="secondary" routerLink="/account/orders" class="mt-5">
        {{ text.backToList }}
      </a>
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="6" />
    }
  `,
})
export class OrderDetailPage {
  private readonly api = inject(OrdersService);
  private readonly confirm = inject(ConfirmService);
  private readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly text = inject(STOREFRONT_TEXT).orders.detail;

  /** Bound from the route's `:reference` segment. */
  readonly reference = input.required<string>();

  protected readonly order = resource({
    params: () => this.reference(),
    loader: ({ params }) => this.api.getMine(params),
  });
  protected readonly showSkeleton = delayedLoading(this.order.isLoading);

  /** Through `hasValue`: an errored resource throws from `value()`. */
  protected readonly detail = computed(() =>
    this.order.hasValue() ? this.order.value() : null,
  );

  /** Answered, and the answer was "no such order of yours". */
  protected readonly missing = computed(
    () => this.order.hasValue() && this.order.value() === null,
  );

  private readonly view = useCustomerOrderView(this.detail);
  protected readonly taxRates = this.view.taxRates;
  protected readonly lines = this.view.lines;
  protected readonly blocks = this.view.blocks;

  /** The table the API refuses by, so the button never offers a refused
   * move. */
  protected readonly cancellable = computed(() => {
    const detail = this.detail();
    return (
      detail !== null && canTransition('customer', detail.status, 'cancelled')
    );
  });

  protected readonly cancelling = signal(false);
  protected readonly cancelFailed = signal(false);

  /**
   * Asks for an optional reason the shop reads. A refusal means the order
   * moved on meanwhile, so it is reloaded. A paid order may still be called
   * off; the warning says this moves no money (FR-ORD-04).
   */
  protected async cancel(detail: OrderDetail): Promise<void> {
    const reason = await this.confirm.askWithReason({
      ...confirmRequest(this.text.cancelConfirm, this.actionText.cancel),
      message: fillText(this.text.cancelConfirm.message, {
        reference: detail.reference,
      }),
      warning:
        detail.paymentState === 'paid'
          ? this.text.cancelConfirm.warning
          : undefined,
      reasonLabel: this.text.cancel.reasonLabel,
      reasonMaxLength: ORDER_STATUS_REASON_MAX,
      reasonRequired: false,
    });
    if (reason === null) return;

    this.cancelling.set(true);
    this.cancelFailed.set(false);
    try {
      const cancelled = await this.api.cancelMine(
        detail.reference,
        reason || null,
      );
      this.cancelFailed.set(!cancelled);
    } finally {
      this.cancelling.set(false);
      this.order.reload();
    }
  }

  constructor() {
    usePageSeo({ name: () => this.reference() });
  }
}
