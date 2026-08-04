import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  categoryDisplayName,
  ProductDetail,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { trustedRichText } from '../core/trusted-rich-text';
import { ChevronRightIcon } from '../ui/icons/chevron-right-icon';
import { PricePipe } from './price.pipe';
import { ProductGallery } from './product-gallery';

/**
 * The presentational product page: breadcrumb, gallery, name, price,
 * rich-text description and the specifications table. Pure — it takes a resolved
 * product and renders it, with no data loading of its own. The storefront route
 * (`ProductDetail`) wraps it with a resource + SEO; the admin editor reuses it
 * as a live preview, so the preview is exactly what visitors will see.
 */
@Component({
  selector: 'app-product-detail-view',
  imports: [RouterLink, PricePipe, ProductGallery, ChevronRightIcon],
  template: `
    <nav [attr.aria-label]="text.catalogRoot">
      <ol
        class="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-subtle"
      >
        <li>
          <a routerLink="/catalog" class="hover:text-accent">
            {{ text.catalogRoot }}
          </a>
        </li>
        @for (crumb of item().category.ancestors; track crumb.slug) {
          <li aria-hidden="true" class="flex items-center">
            <app-icon-chevron-right class="h-4 w-4 text-stone-300" />
          </li>
          <li>
            <a
              [routerLink]="['/catalog', crumb.slug]"
              class="hover:text-accent"
            >
              {{ displayName(crumb) }}
            </a>
          </li>
        }
        <li aria-hidden="true" class="flex items-center">
          <app-icon-chevron-right class="h-4 w-4 text-stone-300" />
        </li>
        <li>
          <a
            [routerLink]="['/catalog', item().category.slug]"
            class="hover:text-accent"
          >
            {{ displayName(item().category) }}
          </a>
        </li>
        <li aria-hidden="true" class="flex items-center">
          <app-icon-chevron-right class="h-4 w-4 text-stone-300" />
        </li>
        <li>
          <span aria-current="page" class="font-medium text-stone-700">
            {{ item().name }}
          </span>
        </li>
      </ol>
    </nav>

    <div class="mt-4 grid gap-8 lg:grid-cols-2">
      <app-product-gallery
        [images]="item().images"
        [productName]="item().name"
      />

      <div>
        <h1 class="text-2xl font-bold tracking-tight sm:text-3xl">
          {{ item().name }}
        </h1>
        <p class="mt-3 text-2xl font-bold text-primary">
          {{ item().priceMinor | price }}
        </p>

        @if (item().descriptionHtml) {
          <div
            class="prose prose-stone mt-6 max-w-none"
            [innerHTML]="safeDescription(item().descriptionHtml)"
          ></div>
        }

        @if (item().attributes.length) {
          <h2
            class="mt-8 text-xs font-semibold tracking-wide text-subtle uppercase"
          >
            {{ text.specifications }}
          </h2>
          <!-- A real table (not a dl) so selecting rows and copying yields
               tab-separated key/value pairs — paste-ready into a spreadsheet or
               the product editor's attribute grid. -->
          <table class="mt-3 w-full border-t border-border text-sm">
            <tbody class="divide-y divide-border">
              @for (attr of item().attributes; track $index) {
                <tr>
                  <th
                    scope="row"
                    class="py-2 pr-4 text-left font-normal text-subtle"
                  >
                    {{ attr.key }}
                  </th>
                  <td class="py-2 text-right text-stone-700">
                    {{ attr.value }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
})
export class ProductDetailView {
  protected readonly text = inject(APP_TEXT).catalog;
  /** The description is trusted rich text (server-sanitized, same as pages). */
  protected readonly safeDescription = trustedRichText();

  readonly item = input.required<ProductDetail>();

  /** Crumbs sit next to their parent, so the nickname is enough. */
  protected readonly displayName = categoryDisplayName;
}
