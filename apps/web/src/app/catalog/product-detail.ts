import { Component, inject, input, resource } from '@angular/core';
import { RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { usePageSeo } from '../core/page-seo';
import { trustedRichText } from '../pages/trusted-rich-text';
import { ChevronRightIcon } from '../ui/icons/chevron-right-icon';
import { CatalogService } from './catalog.service';
import { PricePipe } from './price.pipe';
import { ProductGallery } from './product-gallery';

/**
 * The product page (FR-CAT-05): a two-column layout — the image gallery on the
 * left, and on the right the name, price, a simple rich-text description, and a
 * specifications table of plain key/value attributes (rendered a touch greyer
 * than the description). Stacks to one column on a phone.
 */
@Component({
  selector: 'app-product-detail',
  imports: [RouterLink, PricePipe, ProductGallery, ChevronRightIcon],
  template: `
    <section class="pb-8 sm:pb-12">
      @if (product.error()) {
        <p class="text-stone-600">{{ text.loadError }}</p>
      } @else if (product.hasValue()) {
        @let item = product.value();
        @if (!item) {
          <p class="text-stone-600">{{ text.productNotFound }}</p>
        } @else {
          <nav [attr.aria-label]="text.catalogRoot">
            <ol
              class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500"
            >
              <li>
                <a routerLink="/catalog" class="hover:text-accent">
                  {{ text.catalogRoot }}
                </a>
              </li>
              <li aria-hidden="true" class="flex items-center">
                <app-icon-chevron-right class="h-4 w-4 text-stone-300" />
              </li>
              <li>
                <a
                  [routerLink]="['/catalog', item.category.slug]"
                  class="hover:text-accent"
                >
                  {{ item.category.name }}
                </a>
              </li>
              <li aria-hidden="true" class="flex items-center">
                <app-icon-chevron-right class="h-4 w-4 text-stone-300" />
              </li>
              <li>
                <span aria-current="page" class="font-medium text-stone-700">
                  {{ item.name }}
                </span>
              </li>
            </ol>
          </nav>

          <div class="mt-4 grid gap-8 lg:grid-cols-2">
            <app-product-gallery
              [images]="item.images"
              [productName]="item.name"
            />

            <div>
              <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
                {{ item.name }}
              </h1>
              <p class="mt-3 text-2xl font-bold text-primary">
                {{ item.priceMinor | price }}
              </p>

              @if (item.descriptionHtml) {
                <div
                  class="prose prose-stone mt-6 max-w-none"
                  [innerHTML]="safeDescription(item.descriptionHtml)"
                ></div>
              }

              @if (item.attributes.length) {
                <h2
                  class="mt-8 text-xs font-semibold tracking-wide text-stone-500 uppercase"
                >
                  {{ text.specifications }}
                </h2>
                <dl
                  class="mt-3 divide-y divide-stone-200 border-t border-stone-200 text-sm"
                >
                  @for (attr of item.attributes; track $index) {
                    <div class="flex justify-between gap-4 py-2">
                      <dt class="text-stone-500">{{ attr.key }}</dt>
                      <dd class="text-right text-stone-700">
                        {{ attr.value }}
                      </dd>
                    </div>
                  }
                </dl>
              }
            </div>
          </div>
        }
      } @else {
        <div class="grid animate-pulse gap-8 lg:grid-cols-2" aria-hidden="true">
          <div class="aspect-square rounded-xl bg-stone-200"></div>
          <div class="space-y-4">
            <div class="h-8 w-2/3 rounded bg-stone-200"></div>
            <div class="h-6 w-1/4 rounded bg-stone-200"></div>
            <div class="h-4 w-full rounded bg-stone-200"></div>
            <div class="h-4 w-5/6 rounded bg-stone-200"></div>
          </div>
        </div>
      }
    </section>
  `,
})
export class ProductDetail {
  private catalog = inject(CatalogService);
  protected readonly text = inject(APP_TEXT).catalog;
  /** The description is trusted rich text (server-sanitized, same as pages). */
  protected readonly safeDescription = trustedRichText();

  slug = input.required<string>();

  protected product = resource({
    params: () => ({ slug: this.slug() }),
    loader: ({ params }) => this.catalog.getProduct(params.slug),
  });

  constructor() {
    usePageSeo({
      name: () => this.product.value()?.name,
      description: () =>
        plainTextExcerpt(this.product.value()?.descriptionHtml),
    });
  }
}

/** A meta-description excerpt from a product's rich-text description: tags
 * stripped, whitespace collapsed, trimmed to a sensible length. */
function plainTextExcerpt(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return undefined;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}
