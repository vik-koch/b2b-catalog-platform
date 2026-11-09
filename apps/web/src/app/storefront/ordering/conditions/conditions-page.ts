import {
  formatTaxRate,
  type TaxConfig,
} from '@b2b-catalog-platform/shared/core/catalog';
import type { StorefrontOrderingText } from '../ordering-text.type';
import { STOREFRONT_ORDERING_TEXT } from '../ordering-text';
import { SHARED_ORDERING_TEXT } from '../../../core/ordering/ordering-text';
import { ORDERING_CONFIG } from '../../../core/ordering/ordering-config';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fillText } from '@b2b-catalog-platform/shared/platform';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { EmphasisedText } from '@b2b-catalog-platform/ui/content/emphasised-text';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { banknoteIcon } from '@b2b-catalog-platform/ui/icons/glyphs/banknote';
import { landmarkIcon } from '@b2b-catalog-platform/ui/icons/glyphs/landmark';
import { mapPinIcon } from '@b2b-catalog-platform/ui/icons/glyphs/map-pin';
import { MarkedCard } from '@b2b-catalog-platform/ui/content/marked-card';
import { PageSectionTitle } from '@b2b-catalog-platform/ui/content/page-section-title';
import { StaticPage } from '../../site/pages/static-page';
import { DeliveryZoneList } from '../checkout/ui/delivery-zone-list';
import { SITE_CONFIG } from '../../../core/site/site-config';
import { CATALOG_CONFIG } from '../../../core/catalog/catalog-config';

/**
 * The editable prose, then the conditions read from where checkout reads them
 * and worded as checkout words them, so they cannot disagree with the form
 * that takes the order. A section the deployment has nothing for is left out.
 */
@Component({
  selector: 'app-conditions-page',
  imports: [
    StaticPage,
    MarkedCard,
    PageSectionTitle,
    EmphasisedText,
    RouterLink,
    TextButton,
    DeliveryZoneList,
  ],
  template: `
    <app-static-page slug="conditions">
      <ng-template>
        <div class="max-w-3xl space-y-10">
          @if (hasZones) {
            <section>
              <h2 uiPageSectionTitle class="mb-4">
                {{ fulfilmentText.conditionsHeading }}
              </h2>
              <app-delivery-zone-list [spread]="true" />
              <p class="mt-4 text-sm text-ink-subtle">
                {{ fulfilmentText.conditionsNote }}
              </p>
            </section>
          }

          @if (pickupLocations.length) {
            <section>
              <h2 uiPageSectionTitle>
                {{ sharedOrderingText.fulfilment.pickup }}
              </h2>
              <p class="mt-1 mb-4 text-ink-subtle">
                {{ fulfilmentText.pickupDescription }}
              </p>
              <ul class="space-y-3">
                @for (location of pickupLocations; track location.key) {
                  <li uiMarkedCard [mark]="mapPinIcon">
                    <div
                      class="flex flex-wrap items-baseline justify-between
                             gap-x-4"
                    >
                      <p class="font-medium">{{ location.name }}</p>
                      @if (location.mapUrl) {
                        <a
                          uiTextButton
                          class="text-sm"
                          target="_blank"
                          rel="noopener noreferrer"
                          [href]="location.mapUrl"
                        >
                          {{ fulfilmentText.mapLink }}
                        </a>
                      }
                    </div>
                    <p class="mt-1 text-sm text-ink-subtle">
                      {{ location.address }}
                    </p>
                    @if (location.description) {
                      <p class="mt-2 text-sm text-ink-subtle">
                        <ui-emphasised [text]="location.description" />
                      </p>
                    }
                  </li>
                }
              </ul>
            </section>
          }

          <!-- Both methods: checkout offers the one for whoever is invoiced. -->
          <section>
            <h2 uiPageSectionTitle class="mb-4">
              {{ pageText.paymentHeading }}
            </h2>
            <ul class="space-y-3">
              <li uiMarkedCard [mark]="banknoteIcon">
                <p class="font-medium">{{ paymentNames.cash }}</p>
                <p class="mt-1 text-sm text-ink-subtle">
                  {{ pageText.cashDescription }}
                </p>
                <p class="mt-2 text-sm text-ink-subtle">
                  {{ paymentText.cashPersonOnly }}
                </p>
              </li>
              <li uiMarkedCard [mark]="landmarkIcon">
                <p class="font-medium">{{ paymentNames.transfer }}</p>
                <p class="mt-1 text-sm text-ink-subtle">
                  {{ paymentText.transferDescription }}
                </p>
                <p class="mt-2 text-sm text-ink-subtle">
                  {{ paymentText.transferCompanyOnly }}
                </p>
              </li>
            </ul>
          </section>

          <!-- The tax basis always closes it, whatever the paragraphs say. -->
          <section>
            <h2 uiPageSectionTitle class="mb-4">
              {{ pageText.goodsHeading }}
            </h2>
            <div class="space-y-3 text-ink-subtle">
              @for (paragraph of pageText.goodsParagraphs; track $index) {
                <p><ui-emphasised [text]="paragraph" /></p>
              }
              <p>{{ taxSentence }}</p>
            </div>
          </section>

          <!-- The statutory right is the withdrawal page's to state. -->
          @if (pageText.returnsParagraphs.length || withdrawalPublished) {
            <section>
              <h2 uiPageSectionTitle class="mb-4">
                {{ pageText.returnsHeading }}
              </h2>
              <div class="space-y-3 text-ink-subtle">
                @for (paragraph of pageText.returnsParagraphs; track $index) {
                  <p><ui-emphasised [text]="paragraph" /></p>
                }
                @if (withdrawalPublished) {
                  <p>
                    <a uiTextButton routerLink="/withdrawal">{{
                      pageText.returnsWithdrawalLink
                    }}</a>
                  </p>
                }
              </div>
            </section>
          }
        </div>
      </ng-template>
    </app-static-page>
  `,
})
export class ConditionsPage {
  protected readonly banknoteIcon = banknoteIcon;
  protected readonly landmarkIcon = landmarkIcon;
  protected readonly mapPinIcon = mapPinIcon;
  private readonly storefrontText = inject(STOREFRONT_TEXT);
  private readonly storefrontOrderingText = inject(STOREFRONT_ORDERING_TEXT);
  protected readonly sharedText = inject(SHARED_TEXT);
  protected readonly sharedOrderingText = inject(SHARED_ORDERING_TEXT);
  protected readonly paymentNames =
    this.sharedOrderingText.order.paymentMethods;
  private readonly orderingConfig = inject(ORDERING_CONFIG);
  private readonly siteConfig = inject(SITE_CONFIG);

  protected readonly pageText = this.storefrontOrderingText.conditions;
  protected readonly fulfilmentText =
    this.storefrontOrderingText.checkout.fulfilment;
  protected readonly paymentText = this.storefrontOrderingText.checkout.payment;

  /** The basis in a sentence, naming the default rate where tax is charged. */
  protected readonly taxSentence = taxSentence(
    inject(CATALOG_CONFIG).tax,
    inject(DEPLOYMENT_CONFIG).locale,
    this.pageText,
  );

  protected readonly hasZones =
    (this.orderingConfig.delivery?.zones.length ?? 0) > 0;
  protected readonly pickupLocations =
    this.orderingConfig.pickup?.locations ?? [];
  protected readonly withdrawalPublished =
    this.siteConfig.pages.published.includes('withdrawal');
}

function taxSentence(
  tax: TaxConfig,
  locale: string,
  text: StorefrontOrderingText['conditions'],
): string {
  if (tax.basis === 'none') return text.taxNone;
  return fillText(tax.basis === 'included' ? text.taxIncluded : text.taxAdded, {
    rate: formatTaxRate(tax.rate, locale),
  });
}
