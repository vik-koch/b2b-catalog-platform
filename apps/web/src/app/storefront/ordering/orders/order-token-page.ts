import { Component, computed, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../shared/auth/auth.service';
import { OrderSummary } from '../../../core/ordering/ui/order-summary';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { delayedLoading } from '../../../shared/core/delayed-loading';
import { usePageSeo } from '../../../shared/core/page-seo';
import { NotFoundView } from '../../platform/not-found-view';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { OrderDocumentsList } from './ui/order-documents-list';
import { OrderReadBack } from '../../../core/ordering/ui/order-read-back';
import { OrderHeading } from './ui/order-heading';
import { useCustomerOrderView } from './customer-order-view';
import { OrdersService } from './orders.service';
import { ErrorText } from '@b2b-catalog-platform/ui/fields/error-text';
import { Card } from '@b2b-catalog-platform/ui/content/card';
import { SummaryLayout } from '@b2b-catalog-platform/ui/content/summary-layout';

/**
 * An order opened by the link its mail carries (FR-NOTIF-06). The token is the
 * only credential, so nothing here moves the order or names the account. Kept
 * out of the index and the referrer (NFR-SEO-04): a leaked link must not
 * become a search result.
 */
@Component({
  selector: 'app-order-token-page',
  imports: [
    SummaryLayout,
    Card,
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
    @if (detail(); as order) {
      <ui-summary-layout track="measure">
        <div class="max-w-xl">
          <app-order-heading [order]="order" />
          <p class="mt-4 max-w-xl text-ink-subtle">{{ text.intro }}</p>

          <app-order-read-back
            class="mt-8"
            [lines]="lines()"
            [blocks]="blocks()"
          />
        </div>

        <aside summary>
          <app-order-summary
            [lineCount]="order.lines.length"
            [subtotalMinor]="order.totalMinor"
            [shipment]="order.shipment"
            [taxRates]="taxRates()"
            [taxBasis]="order.taxBasis"
          />

          @if (order.documents.length) {
            <app-order-documents-list
              class="mt-5"
              [documents]="order.documents"
              [by]="{ token: token() }"
            />
          }

          <!-- The account offer checkout postpones; never to somebody signed
                 in, who may have followed a forwarded link. -->
          @if (!signedIn()) {
            <div uiCard class="mt-5">
              <p class="text-sm text-ink-subtle">{{ invite.text }}</p>
              <a
                uiButton
                variant="secondary"
                routerLink="/register"
                class="mt-4 w-full"
              >
                {{ invite.action }}
              </a>
            </div>
          }
        </aside>
      </ui-summary-layout>
    } @else if (missing()) {
      <app-not-found-view
        [body]="text.notFound"
        backLink="/"
        [backLabel]="text.home"
      />
    } @else if (order.error()) {
      <p uiErrorText role="alert">{{ orderText.error }}</p>
    } @else if (showSkeleton()) {
      <ui-skeleton [lines]="6" />
    }
  `,
})
export class OrderTokenPage {
  private readonly api = inject(OrdersService);
  private readonly auth = inject(AuthService);
  private readonly storefrontText = inject(STOREFRONT_TEXT);
  protected readonly orderText = this.storefrontText.orders;
  protected readonly text = this.orderText.public;
  protected readonly invite = this.storefrontText.auth.registerInvite;

  /** The cookie hint too, so the offer is absent from the first frame. No
   * redirect to the account's page: the link holder may not own the order. */
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

  private readonly view = useCustomerOrderView(this.detail);
  protected readonly taxRates = this.view.taxRates;
  protected readonly lines = this.view.lines;
  protected readonly blocks = this.view.blocks;

  constructor() {
    usePageSeo({
      name: () => this.text.heading,
      noindex: true,
      noreferrer: true,
    });
  }
}
