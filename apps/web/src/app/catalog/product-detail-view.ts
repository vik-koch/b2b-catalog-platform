import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  categoryDisplayName,
  encodeAttributeParams,
  formatAttributeValue,
  ProductDetail,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { trustedRichText } from '../core/trusted-rich-text';
import { Button } from '../ui/button';
import { ProductBuyBlock } from './product-buy-block';
import { ProductGallery } from './product-gallery';
import { useProductUnits } from './product-units-view';
import { Icon } from '../ui/icons/icon';

/**
 * The product page's grid: one 30rem column of prose beside one 20rem column
 * of controls, four cells in two rows — the photo over the description, the
 * way to buy over what the thing is. The buying panel and the specifications
 * share a column because they are the same kind of reading: short lines,
 * scanned rather than read, and both about the item rather than about the
 * shop.
 *
 * The widths are the catalogue's own 15rem rule again. The right column wants
 * 20rem and will give up 5 of them before the page breaks; the left will not
 * go under 30rem of prose. Together with the 2.5rem gutter that is 760px of
 * content — `md`, the same drag of the window edge that gives a listing its
 * third column. Under it the page keeps the photo and the panel side by side
 * but hands the description and the table a row each, and the photo shrinks to
 * the 15rem that leaves the panel its 20rem. Under `sm` there is one column and
 * everything is as wide as the page.
 */
export const PRODUCT_PAGE_COLUMNS =
  'grid gap-x-10 gap-y-8 sm:grid-cols-[minmax(0,15rem)_20rem] md:grid-cols-[minmax(30rem,1fr)_minmax(15rem,20rem)]';

/**
 * The description and the specifications: a column each once there are two
 * rows to fill, a row each while the page is too narrow for that.
 */
export const PRODUCT_PAGE_SECTION_CELL =
  'scroll-mt-24 sm:col-span-2 md:col-span-1';

/**
 * The gallery takes the column it is in and caps itself: 25rem of photo, plus
 * the strip of thumbnails when they stand beside it. Whichever it is, the
 * photo is the same 25rem — see ProductGallery.
 */
const IMAGE_CAP = 'w-full';

/** Where the description is collapsed behind a show-more: only where it has no
 * column of its own, which is a phone. */
const NARROW = '(max-width: 39.999rem)';

/**
 * The presentational product page: breadcrumb, gallery, name, price,
 * rich-text description and the specifications table. Pure — it takes a resolved
 * product and renders it, with no data loading of its own. The storefront route
 * (`ProductDetail`) wraps it with a resource + SEO; the admin editor reuses it
 * as a live preview, so the preview is exactly what visitors will see.
 */
@Component({
  selector: 'app-product-detail-view',
  // A fourth page width, beside the wide, form and reading columns: the page's
  // two columns are 30rem of prose and 20rem of controls, and the width past
  // those is width it has nothing to do with — a description set 1200px wide
  // is not one anyone finishes reading. On the component rather than on the
  // route's section, so the editor's live preview is the same page.
  host: { class: 'block max-w-5xl' },
  imports: [
    RouterLink,
    ProductGallery,
    ProductBuyBlock,
    Icon,
    NgTemplateOutlet,
    Button,
  ],
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
            <app-icon name="chevron-right" class="h-4 w-4 text-stone-300" />
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
          <app-icon name="chevron-right" class="h-4 w-4 text-stone-300" />
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
          <app-icon name="chevron-right" class="h-4 w-4 text-stone-300" />
        </li>
        <li>
          <span aria-current="page" class="font-medium text-stone-700">
            {{ item().name }}
          </span>
        </li>
      </ol>
    </nav>

    <!-- Above the columns rather than inside one: with the way to buy in a
         column of its own, a name in the middle column would sit level with the
         price instead of over the whole page. -->
    <h1 class="mt-4 text-2xl font-medium tracking-tight sm:text-3xl">
      {{ item().name }}
    </h1>

    <div [class]="columnsClass">
      <div [class]="imageColumnClass">
        <app-product-gallery
          [images]="item().images"
          [productName]="item().name"
        />
      </div>

      <aside class="@container/buy">
        <app-product-buy-block [item]="item()" [canAdd]="canAdd()" />
      </aside>

      <!-- The seam between the two rows, drawn only where they are rows: with
           one column under md the gap already says it, and a rule across a
           stack is one more line in a page of them. -->
      <div
        aria-hidden="true"
        class="col-span-2 hidden border-t border-border md:block"
      ></div>

      @if (item().descriptionHtml) {
        <div [id]="descriptionId" [class]="sectionCellClass">
          <h2 [class]="sectionHeading">
            <a
              [routerLink]="[]"
              [fragment]="descriptionId"
              queryParamsHandling="preserve"
              [class]="sectionAnchor"
            >
              {{ text.description }}
            </a>
          </h2>
          <div class="relative mt-3">
            <div
              #description
              class="prose prose-stone max-w-none"
              [class]="descriptionClass()"
              [innerHTML]="safeDescription(item().descriptionHtml)"
            ></div>
            @if (descriptionFaded()) {
              <div
                aria-hidden="true"
                class="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-surface to-surface/0"
              ></div>
            }
          </div>
          @if (descriptionToggle()) {
            <div class="mt-1 flex justify-center">
              <button
                type="button"
                appButton
                variant="ghost"
                size="sm"
                [attr.aria-expanded]="descriptionExpanded()"
                (click)="descriptionExpanded.set(!descriptionExpanded())"
              >
                {{ descriptionExpanded() ? text.showLess : text.showMore }}
              </button>
            </div>
          }
        </div>
      }

      <ng-container [ngTemplateOutlet]="specs" />
    </div>

    <!-- Wrapped in an element of its own, so the heading and its table land
         in one grid cell rather than in two. -->
    <ng-template #specs>
      @if (attributes().length || packagingRows().length) {
        <div [id]="specsId" [class]="sectionCellClass">
          <h2 [class]="sectionHeading">
            <a
              [routerLink]="[]"
              [fragment]="specsId"
              queryParamsHandling="preserve"
              [class]="sectionAnchor"
            >
              {{ text.specifications }}
            </a>
          </h2>
          <!-- A real table (not a dl) so selecting rows and copying yields
             tab-separated key/value pairs — paste-ready into a spreadsheet or
             the product editor's attribute grid. -->
          <table class="mt-3 w-full border-t border-border text-sm">
            <tbody class="divide-y divide-border">
              @for (attr of attributes(); track $index) {
                <tr>
                  <th
                    scope="row"
                    class="py-2 pr-4 text-left font-normal text-subtle"
                  >
                    {{ attr.key }}
                  </th>
                  <td class="py-2 text-right text-stone-700">
                    <!-- A filterable value is the way to "more like this": the
                       product's own category, narrowed to this value
                       (FR-ATTR-08). The link treatment is also the only cue
                       that the shop filters by this attribute at all. -->
                    @if (attr.filterParam) {
                      <a
                        [routerLink]="['/catalog', item().category.slug]"
                        [queryParams]="{ attr: attr.filterParam }"
                        class="text-primary font-medium underline decoration-border underline-offset-2 hover:text-accent hover:decoration-accent"
                      >
                        {{ attr.value }}
                      </a>
                    } @else {
                      {{ attr.value }}
                    }
                  </td>
                </tr>
              }
              <!-- Packaging closes the table as one group: the rows above say
                 what the product is, these say how it ships. -->
              @for (row of packagingRows(); track row.label) {
                <tr>
                  <th
                    scope="row"
                    class="py-2 pr-4 text-left font-normal text-subtle"
                  >
                    {{ row.label }}
                  </th>
                  <td class="py-2 text-right text-stone-700">
                    {{ row.value }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </ng-template>
  `,
})
export class ProductDetailView {
  protected readonly text = inject(APP_TEXT).catalog;
  protected readonly columnsClass = `${PRODUCT_PAGE_COLUMNS} mt-6`;
  protected readonly imageColumnClass = `min-w-0 ${IMAGE_CAP}`;
  protected readonly sectionCellClass = PRODUCT_PAGE_SECTION_CELL;
  /**
   * Both halves of the lower row are headed the same way, and each heading is
   * the link to its own section — a specification worth quoting to a colleague
   * has an address now.
   *
   * Written as a router link with a fragment and no path, rather than as a
   * plain `href="#id"`: the document carries `<base href="/">`, against which
   * a bare fragment resolves to the site root, so the link that was meant to
   * move down the page left it. The router keeps the query string too, which
   * is what carries the editor's return path.
   */
  protected readonly sectionHeading =
    'text-xs font-semibold tracking-wide text-subtle uppercase';
  protected readonly sectionAnchor = 'transition-colors hover:text-accent';
  protected readonly descriptionId = 'description';
  protected readonly specsId = 'specifications';
  /** The description is trusted rich text (server-sanitized, same as pages). */
  protected readonly safeDescription = trustedRichText();

  readonly item = input.required<ProductDetail>();
  /** False in the editor's live preview: the buying block is shown so a manager
   * sees the units and the note prompt they just configured, but adding to a
   * cart from a preview of an unsaved product is not a thing to offer. */
  readonly canAdd = input(true);

  /** Crumbs sit next to their parent, so the nickname is enough. */
  protected readonly displayName = categoryDisplayName;

  private readonly units = useProductUnits();
  /**
   * The attributes worth a row. A stored attribute with no value would print a
   * dangling label; the editor stopped saving them, and this covers what was
   * stored before it did.
   */
  protected readonly attributes = computed(() =>
    this.item()
      .attributes.filter((a) => a.value.trim() !== '')
      // A declared attribute's unit lives on the definition, never in the
      // value, so it is joined on here rather than stored (FR-ATTR-01) — and
      // the link is written from the *stored* value, which is what the facet
      // and the URL are keyed by.
      .map((a) => ({
        key: a.key,
        value: formatAttributeValue(a.value, a.unit),
        filterParam: a.filterSlug
          ? encodeAttributeParams([
              { slug: a.filterSlug, values: [a.value] },
            ])[0]
          : null,
      })),
  );

  protected readonly packagingRows = computed(() =>
    this.units.packagingRows(this.item().boxDimensions),
  );

  private readonly description =
    viewChild<ElementRef<HTMLElement>>('description');

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  /** Live viewport state. Stays false on the server (and in unit tests), which
   * renders the whole description — so crawlers always see the full text. */
  private readonly narrow = signal(false);

  protected readonly descriptionExpanded = signal(false);
  /** Set while the collapsed description actually has more text to reveal. */
  private readonly descriptionOverflows = signal(false);

  /** Collapsed only on a phone, where the description has neither a column of
   * its own nor one beside it and would push everything else below the fold. */
  protected readonly descriptionCollapsed = computed(
    () => this.narrow() && !this.descriptionExpanded(),
  );
  /** A description that fits inside the cap is not clipped, so fading its last
   * line would only make readable text look cut off. */
  protected readonly descriptionFaded = computed(
    () => this.descriptionCollapsed() && this.descriptionOverflows(),
  );
  protected readonly descriptionClass = computed(() =>
    this.descriptionCollapsed() ? 'max-h-[8.75rem] overflow-hidden' : '',
  );
  protected readonly descriptionToggle = computed(
    () =>
      this.narrow() &&
      (this.descriptionExpanded() || this.descriptionOverflows()),
  );

  constructor() {
    if (!this.isBrowser) {
      return;
    }
    afterNextRender(() => {
      // The collapse depends on a measured height, so without a layout engine
      // (jsdom, in unit tests) it is not armed and the whole text stands.
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      this.watch(NARROW, this.narrow);

      // The height changes with the description expanding and with the phone
      // turning, so measure continuously rather than once.
      const desc = this.description()?.nativeElement;
      if (!desc) {
        return;
      }
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(desc);
      this.destroyRef.onDestroy(() => observer.disconnect());
      this.measure();
    });
  }

  /** Mirrors a media query into a signal for the lifetime of the component. */
  private watch(query: string, target: ReturnType<typeof signal<boolean>>) {
    const list = window.matchMedia(query);
    const update = () => target.set(list.matches);
    update();
    list.addEventListener('change', update);
    this.destroyRef.onDestroy(() => list.removeEventListener('change', update));
  }

  private measure() {
    const desc = this.description()?.nativeElement;
    if (desc && this.descriptionCollapsed()) {
      this.descriptionOverflows.set(desc.scrollHeight > desc.clientHeight + 1);
    }
  }
}
