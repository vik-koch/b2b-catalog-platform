import { Component, computed, inject, input, resource } from '@angular/core';
import { useTaxStatement } from '../../shared/catalog/tax-statement';
import { RouterLink } from '@angular/router';
import {
  fillText,
  OrderDetail,
  moneyFormat,
} from '@b2b-catalog-platform/shared';
import { AuthService } from '../../shared/auth/auth.service';
import { OrderSummary } from '../../shared/cart/order-summary';
import { formatPriceMinor } from '../../shared/catalog/price';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { usePageSeo } from '../../shared/core/page-seo';
import { NotFoundView } from '../pages/not-found-view';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import {
  injectCustomerBlockLabels,
  orderBlocks,
} from '../../shared/orders/order-blocks';
import { customerQuantity } from '../../shared/orders/order-view';
import { OrderDocumentsList } from './order-documents-list';
import {
  OrderReadBack,
  ReadBackLine,
  ReviewBlock,
} from '../../shared/orders/order-read-back';
import {
  StatusBadge,
  StatusTone,
} from '@b2b-catalog-platform/ui/content/status-badge';
import {
  orderPaymentLabel,
  orderPaymentTone,
  orderStatusLabel,
  orderStatusTone,
} from '../../shared/orders/order-status';
import { OrdersService } from './orders.service';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';

/**
 * An order opened by the link its confirmation mail carries (FR-NOTIF-06).
 *
 * The token is the credential and the only one: whoever holds the link reads
 * the order, which is what makes it useful to a guest — they have no account to
 * read it from. Nothing here is editable and nothing identifies the account,
 * for the same reason.
 *
 * Kept out of the index (NFR-SEO-04): a crawler has no way to hold one of these
 * links, but a referrer leak should not turn one into a search result.
 */
@Component({
  selector: 'app-order-token-page',
  imports: [
    RouterLink,
    Button,
    NotFoundView,
    Skeleton,
    OrderDocumentsList,
    OrderReadBack,
    OrderSummary,
    StatusBadge,
    PageTitle,
    ErrorText,
  ],
  template: `
    @if (detail(); as order) {
      <!-- Left-aligned under a left-aligned heading, in the same two columns
           the cart, the checkout and the account's own order page draw: this
           is the same order read through a link rather than through a session,
           and it should not be a differently shaped page for it. -->
      <div class="@container/order">
        <div
          class="grid gap-10
                 @min-[63.75rem]/order:grid-cols-[36rem_20rem]
                 @min-[63.75rem]/order:justify-between"
        >
          <!-- The track is the measure: an order is read down its left edge,
               and a name-and-price line spanning a wide screen is one nobody
               follows across. The same 36rem the cart gives its lines and the
               checkout its form, so the card beside it lands in one place on
               all three. -->
          <div class="max-w-xl">
            <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <h1 appPageTitle>
                {{ order.reference }}
              </h1>
              <span appStatusBadge [tone]="statusTone(order)">
                {{ statusLabel(order) }}
              </span>
              @if (paymentLabel(order); as payment) {
                <span appStatusBadge variant="dot" [tone]="paymentTone(order)">
                  {{ payment }}
                </span>
              }
            </div>
            <p class="mt-2 text-ink-subtle">{{ placed(order) }}</p>
            <!-- Why, on the line that says where the order stands. A mailed
                 link is where a guest reads it and they have nowhere else to
                 look; the link stays a read capability, and nothing here moves
                 the order. -->
            @if (order.statusReason; as reason) {
              <p class="mt-1 text-ink-subtle">
                <span class="text-ink-subtle"> {{ names.reason }}: </span>
                {{ reason }}
              </p>
            }
            @if (order.changes.length) {
              <div class="mt-1 text-ink-subtle">
                <span class="text-ink-subtle">{{ names.changeNote }}:</span>
                @for (change of order.changes; track $index) {
                  <span class="block">{{ change }}</span>
                }
              </div>
            }
            <p class="mt-4 max-w-xl text-ink-subtle">{{ text.intro }}</p>

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
              [lineCount]="order.lines.length"
              [subtotalMinor]="order.totalMinor"
              [shipment]="order.shipment"
              [taxRates]="taxRates()"
              [taxBasis]="order.taxBasis"
            />

            <!-- The same documents the account's own page offers, in the same
                 place, reached the only way this reader can be entitled to
                 them: the token the link carries (FR-NOTIF-06). -->
            @if (order.documents.length) {
              <app-order-documents-list
                class="mt-5"
                [documents]="order.documents"
                [by]="{ token: token() }"
              />
            }

            <!-- The account offer the checkout deliberately postponed:
                 approval takes days, and an order already sent costs nothing
                 to wait for. Never to somebody who already has one — this page
                 is reachable by anyone holding the link, including a customer
                 who followed an old one or was forwarded it.

                 Under the summary, where every other flow keeps what to do
                 next. -->
            @if (!signedIn()) {
              <div class="mt-5 rounded-lg border border-edge p-5">
                <p class="text-sm text-ink-subtle">{{ invite.text }}</p>
                <a
                  appButton
                  variant="secondary"
                  routerLink="/register"
                  class="mt-4 w-full"
                >
                  {{ invite.action }}
                </a>
              </div>
            }
          </aside>
        </div>
      </div>
    } @else if (missing()) {
      <!-- The same 404 screen an unknown product or category gets: a link that
           opens nothing is a link that opens nothing, and this one was a
           couple of lines of prose where the rest of the app draws a page. It
           carries the response status too, so a leaked link answers a crawler
           honestly. -->
      <app-not-found-view
        [body]="text.notFound"
        backLink="/"
        [backLabel]="text.home"
      />
    } @else if (order.error()) {
      <p appErrorText role="alert">{{ orderText.error }}</p>
    } @else if (showSkeleton()) {
      <app-skeleton [lines]="6" />
    }
  `,
})
export class OrderTokenPage {
  private readonly api = inject(OrdersService);
  private readonly auth = inject(AuthService);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly currency = moneyFormat(this.config);

  private readonly storefrontText = inject(STOREFRONT_TEXT);
  private readonly customerLabels = injectCustomerBlockLabels();
  private readonly sharedText = inject(SHARED_TEXT);
  protected readonly names = this.sharedText.order;
  protected readonly orderText = this.storefrontText.orders;
  protected readonly text = this.orderText.public;
  protected readonly invite = this.storefrontText.auth.registerInvite;

  /**
   * Whether the reader has an account of their own. The cookie hint rather
   * than the resolved session, so the offer is absent on the first frame
   * instead of appearing and being taken away again.
   *
   * Deliberately not a redirect to the account's own order page: the token is
   * the credential here, and whoever holds the link may well not be the
   * customer whose order it is.
   */
  protected readonly signedIn = computed(
    () => this.auth.hintedRole() !== null || this.auth.user() !== null,
  );

  /** Bound from the route's `:token` segment. */
  readonly token = input.required<string>();

  protected readonly order = resource({
    params: () => this.token(),
    loader: ({ params }) => this.api.getByToken(params),
  });
  protected readonly showSkeleton = delayedLoading(this.order.isLoading);

  /** Read through `hasValue`: an errored resource throws from `value()`. */
  protected readonly detail = computed(() =>
    this.order.hasValue() ? this.order.value() : null,
  );
  protected readonly missing = computed(
    () => this.order.hasValue() && this.order.value() === null,
  );

  private readonly tax = useTaxStatement();
  /** What the total names, or why it names only the basis (NFR-LEGAL-11). */
  protected readonly taxRates = computed(
    () => this.detail()?.lines.map((line) => line.taxRate) ?? [],
  );

  protected readonly lines = computed<ReadBackLine[]>(() => {
    const order = this.detail();
    if (!order) return [];
    const perLine = this.tax.perLine(
      order.lines.map((line) => line.taxRate),
      order.taxBasis,
    );
    return order.lines.map((line, index) => ({
      key: `${line.slug}-${index}`,
      name: line.name,
      note: line.note,
      href: line.linked ? `/product/${line.slug}` : null,
      quantity: customerQuantity(line, this.sharedText, this.currency),
      total: formatPriceMinor(line.lineTotalMinor, this.currency),
      // Only once the lines differ: a rate the total names would otherwise
      // be said on every line for nothing.
      taxRate: perLine ? this.tax.line(line.taxRate) : null,
    }));
  });

  protected readonly blocks = computed<ReviewBlock[]>(() => {
    const order = this.detail();
    if (!order) return [];

    return orderBlocks(order, this.customerLabels, {
      address: this.config.address,
      phoneInput: this.config.phoneInput,
      locale: this.config.locale,
    });
  });

  protected placed(order: OrderDetail): string {
    return fillText(this.orderText.detail.placed, {
      date: new Intl.DateTimeFormat(this.config.locale, {
        dateStyle: 'long',
      }).format(new Date(order.createdAt)),
    });
  }

  protected statusLabel(order: OrderDetail): string {
    return orderStatusLabel(
      order.status,
      order.fulfilmentMethod,
      this.names.statuses,
    );
  }

  protected statusTone(order: OrderDetail): StatusTone {
    return orderStatusTone(order.status, 'customer', order.fulfilmentMethod);
  }

  protected paymentLabel(order: OrderDetail): string | null {
    return orderPaymentLabel(order.paymentState, this.names.paymentStates);
  }

  protected paymentTone(order: OrderDetail): StatusTone {
    return orderPaymentTone(order.paymentState);
  }

  constructor() {
    usePageSeo({
      name: () => this.text.heading,
      noindex: true,
      noreferrer: true,
    });
  }
}
