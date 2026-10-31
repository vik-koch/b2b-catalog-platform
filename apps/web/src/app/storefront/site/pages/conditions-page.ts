import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  fillText,
  formatTaxRate,
  DeploymentConfig,
} from '@b2b-catalog-platform/shared';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { StorefrontText } from '../../../shared/config/storefront-text.type';
import { DEPLOYMENT_CONFIG } from '../../../shared/config/deployment-config';
import { DeliveryZoneList } from '../../checkout/delivery-zone-list';
import { EmphasisedText } from '@b2b-catalog-platform/ui/content/emphasised-text';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { banknoteIcon } from '@b2b-catalog-platform/ui/icons/glyphs/banknote';
import { landmarkIcon } from '@b2b-catalog-platform/ui/icons/glyphs/landmark';
import { mapPinIcon } from '@b2b-catalog-platform/ui/icons/glyphs/map-pin';
import { MarkedCard } from '@b2b-catalog-platform/ui/content/marked-card';
import { PageSectionTitle } from '@b2b-catalog-platform/ui/content/page-section-title';
import { StaticPage } from './static-page';

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
    DeliveryZoneList,
    EmphasisedText,
    RouterLink,
    TextButton,
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
                {{ sharedText.fulfilment.pickup }}
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
  protected readonly sharedText = inject(SHARED_TEXT);
  protected readonly paymentNames = this.sharedText.order.paymentMethods;
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly pageText = this.storefrontText.conditions;
  protected readonly fulfilmentText = this.storefrontText.checkout.fulfilment;
  protected readonly paymentText = this.storefrontText.checkout.payment;

  /** The basis in a sentence, naming the default rate where tax is charged. */
  protected readonly taxSentence = taxSentence(this.config, this.pageText);

  protected readonly hasZones = (this.config.delivery?.zones.length ?? 0) > 0;
  protected readonly pickupLocations = this.config.pickup?.locations ?? [];
  protected readonly withdrawalPublished =
    this.config.pages.published.includes('withdrawal');
}

function taxSentence(
  config: DeploymentConfig,
  text: StorefrontText['conditions'],
): string {
  const { tax } = config;
  if (tax.basis === 'none') return text.taxNone;
  return fillText(tax.basis === 'included' ? text.taxIncluded : text.taxAdded, {
    rate: formatTaxRate(tax.rate, config.locale),
  });
}
