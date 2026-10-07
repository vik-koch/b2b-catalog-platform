import { Component, computed, inject, resource } from '@angular/core';
import { fillText, formatTaxRate } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { AppText } from '../config/app-text.type';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { DeploymentConfig } from '../config/deployment-config.type';
import { injectEditorReturnParams } from '../admin/editor-return';
import { editAwareContent } from '../admin/edit-aware-content';
import { EditActions } from '../admin/edit-actions';
import { DeliveryZoneList } from '../checkout/delivery-zone-list';
import { usePageSeo } from '../core/page-seo';
import { trustedRichText } from '../core/trusted-rich-text';
import { TextButton } from '../ui/link';
import { LoadErrorView } from './load-error-view';
import { PageService } from './page.service';
import { PageUpdated } from './page-updated';

/**
 * Payment and delivery conditions (FR-NAV-03) — a code route that renders an
 * editable body, as the contact page does.
 *
 * The body is the shop's prose; the conditions under it are read from where
 * checkout reads them and worded as checkout words them: the delivery zones
 * and pickup points from deployment config, the payment methods from the
 * platform's rule of which party pays how. Typed into the body instead, they
 * would be a second copy free to disagree with the form that takes the order.
 *
 * A section the deployment has nothing for is left out — no zones, no zone
 * list; no pickup points, no pickup.
 */
@Component({
  selector: 'app-conditions-page',
  imports: [
    DeliveryZoneList,
    EditActions,
    TextButton,
    LoadErrorView,
    PageUpdated,
  ],
  template: `
    <!-- Nothing renders before the body arrives, and a body that failed or was
         never written takes the page down with it — the same rules, and the
         same reasons, as the contact page. -->
    @if (pageResource.error()) {
      <app-load-error-view [heading]="errorText.cannotLoadTitle" />
    } @else if (missing()) {
      <app-load-error-view [heading]="errorText.cannotLoadTitle" />
    } @else if (ready()) {
      @let content = page();
      <div class="flex items-start justify-between gap-4">
        <h1 class="mb-4 text-3xl font-medium tracking-tight">
          {{ content?.title || navLabel }}
        </h1>
        @if (canEdit(); as editorText) {
          <app-edit-actions
            variant="inline"
            [editLink]="['/admin/pages', 'conditions', 'edit']"
            [editParams]="editorFrom()"
            [editLabel]="editorText.edit"
          />
        }
      </div>

      @if (content) {
        <div
          class="prose prose-stone mb-8 max-w-3xl"
          [innerHTML]="safeBody(content.bodyHtml)"
        ></div>
      } @else if (canEdit(); as editorText) {
        <p class="mb-4 text-muted">{{ editorText.emptyNotice }}</p>
      }

      <div class="max-w-3xl space-y-10">
        @if (hasZones) {
          <section>
            <h2 class="mb-4 text-2xl font-normal tracking-tight">
              {{ fulfilmentText.conditionsHeading }}
            </h2>
            <app-delivery-zone-list />
            <p class="mt-4 text-sm text-subtle">
              {{ fulfilmentText.conditionsNote }}
            </p>
          </section>
        }

        @if (pickupLocations.length) {
          <section>
            <h2 class="text-2xl font-normal tracking-tight">
              {{ fulfilmentText.pickupTitle }}
            </h2>
            <p class="mt-1 mb-4 text-muted">
              {{ fulfilmentText.pickupDescription }}
            </p>
            <ul class="space-y-3">
              @for (location of pickupLocations; track location.key) {
                <li class="rounded-lg border border-border p-4">
                  <div
                    class="flex flex-wrap items-baseline justify-between gap-x-4"
                  >
                    <p class="font-medium">{{ location.name }}</p>
                    @if (location.mapUrl) {
                      <a
                        appTextButton
                        class="text-sm"
                        target="_blank"
                        rel="noopener noreferrer"
                        [href]="location.mapUrl"
                      >
                        {{ fulfilmentText.mapLink }}
                      </a>
                    }
                  </div>
                  <p class="mt-1 text-sm text-muted">{{ location.address }}</p>
                  @if (location.description) {
                    <p class="mt-2 text-sm text-subtle">
                      {{ location.description }}
                    </p>
                  }
                </li>
              }
            </ul>
          </section>
        }

        <!-- Both methods, each with the party it is for: checkout offers
             exactly one of them to whoever is invoiced, and says why the other
             is greyed in these same words. -->
        <section>
          <h2 class="mb-4 text-2xl font-normal tracking-tight">
            {{ pageText.paymentHeading }}
          </h2>
          <ul class="space-y-3">
            <li class="rounded-lg border border-border p-4">
              <p class="font-medium">{{ paymentText.cashTitle }}</p>
              <p class="mt-1 text-sm text-muted">
                {{ pageText.cashDescription }}
              </p>
              <p class="mt-2 text-sm text-subtle">
                {{ paymentText.cashPersonOnly }}
              </p>
            </li>
            <li class="rounded-lg border border-border p-4">
              <p class="font-medium">{{ paymentText.transferTitle }}</p>
              <p class="mt-1 text-sm text-muted">
                {{ paymentText.transferDescription }}
              </p>
              <p class="mt-2 text-sm text-subtle">
                {{ paymentText.transferCompanyOnly }}
              </p>
            </li>
          </ul>
        </section>

        <!-- The basis every price on the site is quoted on (NFR-LEGAL-11),
             in the deployment's own sentence for it. -->
        <section>
          <h2 class="mb-4 text-2xl font-normal tracking-tight">
            {{ pageText.taxHeading }}
          </h2>
          <p class="text-muted">{{ taxSentence }}</p>
        </section>
      </div>
    } @else if (showSkeleton()) {
      <div class="animate-pulse space-y-4" aria-hidden="true">
        <div class="h-8 w-1/3 rounded bg-stone-200"></div>
        <div class="h-4 w-full rounded bg-stone-200"></div>
        <div class="h-4 w-5/6 rounded bg-stone-200"></div>
      </div>
    }
  `,
})
export class ConditionsPage {
  private readonly appText = inject(APP_TEXT);
  private readonly config = inject(DEPLOYMENT_CONFIG);
  private readonly pageService = inject(PageService);

  protected readonly navLabel = this.appText.nav['conditions'] ?? '';
  protected readonly errorText = this.appText.errors;
  protected readonly pageText = this.appText.conditions;
  protected readonly fulfilmentText = this.appText.checkout.fulfilment;
  protected readonly paymentText = this.appText.checkout.payment;

  /** The basis in a sentence, naming the default rate where tax is charged. */
  protected readonly taxSentence = taxSentence(this.config, this.pageText);

  protected readonly hasZones = (this.config.delivery?.zones.length ?? 0) > 0;
  protected readonly pickupLocations = this.config.pickup?.locations ?? [];

  protected readonly editorFrom = injectEditorReturnParams();
  /** Bypasses Angular's redundant innerHTML sanitizer for the server-sanitized
   * page body — see trustedRichText. */
  protected readonly safeBody = trustedRichText();

  protected readonly pageResource = resource({
    loader: () => this.pageService.getPage('conditions'),
  });

  // `undefined` while loading *or failed*, `null` when the page has no row yet.
  // Guarded: `value()` throws on an errored resource, and an unguarded read
  // during SSR kills the render before it can set a status.
  protected readonly page = computed(() =>
    this.pageResource.hasValue() ? this.pageResource.value() : undefined,
  );

  private readonly content = editAwareContent({
    ready: computed(
      () =>
        !this.pageResource.isLoading() && this.pageResource.status() !== 'idle',
    ),
    section: 'pageEditor',
  });
  protected readonly ready = this.content.ready;
  protected readonly canEdit = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;

  /** No row, and nobody here who could write one: the page cannot be served. */
  protected readonly missing = computed(
    () => this.ready() && this.page() === null && !this.canEdit(),
  );

  constructor() {
    usePageSeo({ name: () => this.page()?.title || this.navLabel });
  }
}

function taxSentence(
  config: DeploymentConfig,
  text: AppText['conditions'],
): string {
  const { tax } = config;
  if (tax.basis === 'none') return text.taxNone;
  return fillText(tax.basis === 'included' ? text.taxIncluded : text.taxAdded, {
    rate: formatTaxRate(tax.rate, config.catalog.currency.locale),
  });
}
