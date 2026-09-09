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
  fillText,
  ORDER_STATUS_REASON_MAX,
  OrderDetail,
} from '@b2b-catalog-platform/shared';
import { OrderSummary } from '../cart/order-summary';
import { formatPriceMinor } from '../catalog/price';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { delayedLoading } from '../core/delayed-loading';
import { usePageSeo } from '../core/page-seo';
import { NotFoundView } from '../pages/not-found-view';
import { Button } from '../ui/button';
import { ConfirmService } from '../ui/confirm.service';
import { Skeleton } from '../ui/skeleton';
import { StatusBadge, StatusTone } from '../ui/status-badge';
import { orderBlocks } from './order-blocks';
import { OrderDocumentsList } from './order-documents-list';
import { OrderReadBack, ReadBackLine, ReviewBlock } from './order-read-back';
import {
  orderPaymentLabel,
  orderPaymentTone,
  orderStatusLabel,
  orderStatusTone,
} from './order-status';
import { customerBlockLabels, customerQuantity } from './order-view';
import { OrdersService } from './orders.service';

/**
 * One of the account's own orders (FR-ACC-01), read back exactly as it was
 * sent — every field on it is a snapshot, so this is the order as it stood
 * rather than what the catalogue, the address book or the config say today.
 *
 * Nearly read-only: the one thing a customer does to their own order is call
 * it off, and only while the shop has not started on it (FR-ORD-02). Changing
 * what is on an order is a conversation rather than a form.
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
    StatusBadge,
  ],
  template: `
    @if (detail(); as detail) {
      <!-- The cart's and the checkout's two columns, at the cart's own notch
           and measured on the page rather than the window: an order is read
           where it was last seen, so the card must not sit beside the lines on
           one screen and under them on the next. -->
      <div class="@container/order">
        <div
          class="grid gap-10 @min-[63.75rem]/order:grid-cols-[36rem_20rem] @min-[63.75rem]/order:justify-between"
        >
          <!-- The track is the measure: an order is read down its left edge,
               and a name-and-price line spanning a wide screen is one nobody
               follows across. The same 36rem the cart gives its lines and the
               checkout its form, so the card beside it lands in one place on
               all three. -->
          <div class="max-w-xl">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 class="text-3xl font-medium tracking-tight">
                {{ detail.reference }}
              </h1>
              <span appStatusBadge [tone]="statusTone(detail)">
                {{ statusLabel(detail) }}
              </span>
              @if (paymentLabel(detail); as payment) {
                <span appStatusBadge variant="dot" [tone]="paymentTone(detail)">
                  {{ payment }}
                </span>
              }
            </div>
            <p class="mt-2 text-muted">{{ placed(detail) }}</p>
            <!-- Why, on the line that says where the order stands: the reason
                 is part of the status, not a fact beside it. -->
            @if (detail.statusReason; as reason) {
              <p class="mt-1 text-muted">
                <span class="text-subtle">{{ text.statusReason }}:</span>
                {{ reason }}
              </p>
            }
            <!-- And what the shop changed, on the same line, for the same
                 reason: the order reads as it now is, and this is the sentence
                 that says why it differs from the one that was sent. -->
            @if (detail.changes.length) {
              <div class="mt-1 text-muted">
                <span class="text-subtle">{{ text.changes }}:</span>
                @for (change of detail.changes; track $index) {
                  <span class="block">{{ change }}</span>
                }
              </div>
            }

            <app-order-read-back
              class="mt-8"
              [lines]="lines()"
              [blocks]="blocks()"
            />
          </div>

          <!-- What it came to, and the way back under it: controls belong
               below the card they act after, which is where the cart and the
               checkout put theirs. -->
          <aside
            class="max-w-xl @min-[63.75rem]/order:mt-9 @min-[63.75rem]/order:sticky @min-[63.75rem]/order:top-20 @min-[63.75rem]/order:self-start"
          >
            <app-order-summary
              [lineCount]="detail.lines.length"
              [subtotalMinor]="detail.totalMinor"
              [shipment]="detail.shipment"
            />
            <!-- What the order carries (FR-ORD-05). Under the summary and
                 above the way out: a document is a copy of what has just been
                 read, and the controls stay last. -->
            @if (detail.documents.length) {
              <app-order-documents-list
                class="mt-5"
                [documents]="detail.documents"
                [by]="{ reference: detail.reference }"
              />
            }

            <!-- Offered from the same table the API refuses by, so the
                 button is never drawn for a move the server would decline. -->
            @if (cancellable()) {
              <button
                appButton
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
              <p class="mt-3 text-sm text-red-600" role="alert">
                {{ text.cancel.error }}
              </p>
            }
            <a
              appButton
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
      <!-- The 404 screen rather than a sentence, the same as the token page
           and the unknown-slug pages: a reference that is not on this account
           is a page that is not there. -->
      <app-not-found-view
        [body]="text.notFound"
        backLink="/account/orders"
        [backLabel]="text.backToList"
      />
    } @else if (order.error()) {
      <p class="text-sm text-red-600" role="alert">{{ text.error }}</p>
      <a
        appButton
        variant="secondary"
        routerLink="/account/orders"
        class="mt-5"
      >
        {{ text.backToList }}
      </a>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class OrderDetailPage {
  private readonly api = inject(OrdersService);
  private readonly confirm = inject(ConfirmService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = this.config.catalog.currency;

  private readonly appText = inject(APP_TEXT);
  private readonly orderText = this.appText.orders;
  protected readonly text = this.orderText.detail;

  /** Bound from the route's `:reference` segment. */
  readonly reference = input.required<string>();

  protected readonly order = resource({
    params: () => this.reference(),
    loader: ({ params }) => this.api.getMine(params),
  });
  protected readonly showSkeleton = delayedLoading(this.order.isLoading);

  /** The order, once there is one. Read through `hasValue` because a resource
   * in an error state throws from `value()`. */
  protected readonly detail = computed(() =>
    this.order.hasValue() ? this.order.value() : null,
  );

  /** Answered, and the answer was "no such order of yours". */
  protected readonly missing = computed(
    () => this.order.hasValue() && this.order.value() === null,
  );

  protected readonly lines = computed<ReadBackLine[]>(() => {
    const detail = this.detail();
    if (!detail) return [];
    return detail.lines.map((line, index) => ({
      key: `${line.slug}-${index}`,
      name: line.name,
      note: line.note,
      href: line.linked ? `/product/${line.slug}` : null,
      quantity: customerQuantity(line, this.appText, this.currency),
      total: formatPriceMinor(line.lineTotalMinor, this.currency),
    }));
  });

  /**
   * The order's answers, headed by the same words the checkout asked the
   * questions in — so an order reads the same before and after it was sent.
   */
  protected readonly blocks = computed<ReviewBlock[]>(() => {
    const detail = this.detail();
    if (!detail) return [];

    return orderBlocks(detail, customerBlockLabels(this.appText), {
      address: this.config.address,
      phoneInput: this.config.phoneInput,
      locale: this.currency.locale,
    });
  });

  protected placed(detail: OrderDetail): string {
    return fillText(this.text.placed, {
      date: this.dateFormat.format(new Date(detail.createdAt)),
    });
  }

  protected statusLabel(detail: OrderDetail): string {
    return orderStatusLabel(
      detail.status,
      detail.fulfilmentMethod,
      this.orderText,
    );
  }

  protected statusTone(detail: OrderDetail): StatusTone {
    return orderStatusTone(detail.status, 'customer', detail.fulfilmentMethod);
  }

  protected paymentLabel(detail: OrderDetail): string | null {
    return orderPaymentLabel(detail.paymentState, this.orderText);
  }

  protected paymentTone(detail: OrderDetail): StatusTone {
    return orderPaymentTone(detail.paymentState);
  }

  /** The shared transition table, asked in the browser for the same reason the
   * API asks it: there is one rule, and this is a reader of it. */
  protected readonly cancellable = computed(() => {
    const detail = this.detail();
    return (
      detail !== null && canTransition('customer', detail.status, 'cancelled')
    );
  });

  protected readonly cancelling = signal(false);
  protected readonly cancelFailed = signal(false);

  /**
   * Asked for with a reason, because the shop reads it — somebody may already
   * be packing the order. A refusal here means it moved on while the page was
   * open, so the order is reloaded rather than argued with.
   */
  protected async cancel(detail: OrderDetail): Promise<void> {
    const reason = await this.confirm.askWithReason({
      heading: this.text.cancel.heading,
      message: fillText(this.text.cancel.message, {
        reference: detail.reference,
      }),
      confirmLabel: this.text.cancel.confirm,
      cancelLabel: this.text.cancel.keep,
      reasonLabel: this.text.cancel.reasonLabel,
      reasonMaxLength: ORDER_STATUS_REASON_MAX,
      // Asked, not insisted on: the shop's own refusals owe the customer an
      // explanation, and a customer changing their mind owes nobody one.
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

  private readonly dateFormat = new Intl.DateTimeFormat(this.currency.locale, {
    dateStyle: 'long',
  });

  constructor() {
    usePageSeo({ name: () => this.reference() });
  }
}
