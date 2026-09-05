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
import { Icon } from '../ui/icons/icon';
import { Link } from '../ui/link';
import { ProductBuyBlock } from './product-buy-block';
import { ProductGallery } from './product-gallery';
import { useProductUnits } from './product-units-view';

/**
 * The product page's grid — one band of three columns at the top, and the two
 * long readings under it.
 *
 * The top band is what the page is *for*: the photo, the handful of facts that
 * decide whether this is the right product, and the way to buy it. Everything
 * that is read rather than scanned goes below it, one row each and set to a
 * reading width — a description at 1200px is not one anybody finishes.
 *
 * The three widths, and where they come from:
 *
 * - The photo's column is `max-content`: sized to the photo, not to a figure
 *   written here — the gallery is 30rem with a strip of thumbnails beside it
 *   and 25rem without, and a track fixed at the larger leaves five rems of
 *   nothing on every product with one picture. It is the one track that may
 *   not be squeezed: grid hands free space to the tracks that can grow *in
 *   equal shares*, so a photo asked to share with the panel arrived narrower
 *   than the gallery inside it and pushed the thumbnails off the left edge.
 * - The buying panel takes 20rem where there is room and gives up five of them
 *   before anything else does. Past 20rem it would be a wide panel of narrow
 *   controls, so the track caps rather than the panel.
 * - The facts take everything else — including whatever the panel did not
 *   want. They are the column that can use it: a table of short pairs reads
 *   better wide than wrapped.
 *
 * Both of the right-hand columns floor at 15rem, the catalogue's own column,
 * so three of them need 30 + 15 + 15 plus two 2.5rem gutters — 65rem, and that
 * is where the third appears.
 *
 * Under 65rem there is no room for facts beside the photo and they are simply
 * gone — they are a summary of a table that is still on the page. The band is
 * then the photo and the panel, held apart rather than packed left: the panel
 * stays on the page's right edge, where it was a pixel before the third column
 * disappeared, and the space that column will occupy again is left standing
 * where it belongs. Under 40rem it is one column and everything is as wide as
 * the page.
 *
 * Container queries rather than the window, because the admin's live preview
 * draws this same page inside an editor column: what decides the layout is the
 * room the page actually has, which is the only thing a media query cannot
 * see.
 */
export const PRODUCT_PAGE_COLUMNS =
  'grid gap-x-10 gap-y-8 ' +
  '@min-[40rem]/product:justify-between ' +
  '@min-[40rem]/product:grid-cols-[minmax(0,30rem)_minmax(15rem,20rem)] ' +
  '@min-[65rem]/product:justify-normal ' +
  '@min-[65rem]/product:grid-cols-[max-content_minmax(15rem,1fr)_minmax(15rem,20rem)]';

/**
 * The description and the specifications: a row each, the full width of the
 * band. The measure is the section's own — prose reads to 3xl, and a table of
 * short pairs set that wide is a key and a value with a hand's width of
 * nothing between them.
 */
export const PRODUCT_PAGE_SECTION_CELL = 'col-span-full scroll-mt-24';
const READING_WIDTH = 'max-w-3xl';
const TABLE_WIDTH = 'max-w-xl';

/**
 * The gallery takes the column it is in and caps itself: 25rem of photo, plus
 * the strip of thumbnails when they stand beside it. Whichever it is, the
 * photo is the same 25rem — see ProductGallery.
 */
const IMAGE_CAP = 'w-full';

/** How many facts stand beside the photo. Four is a glance; the rest are a
 * table, and the link under them goes to it. */
const MAIN_SPECS = 4;

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
  // A fourth page width, beside the wide, form and reading columns: the top
  // band wants three columns and the readings under it are set to a measure of
  // their own, so the page is as wide as the band and no wider. On the
  // component rather than on the route's section, so the editor's live preview
  // is the same page — and a container, so that preview lays itself out by the
  // room it has rather than by the window around the editor.
  host: { class: 'block @container/product max-w-7xl' },
  imports: [
    RouterLink,
    ProductGallery,
    ProductBuyBlock,
    Icon,
    Link,
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
        <!-- The product's own crumb is the one line the trail can lose on a
             phone: the <h1> under it says the same thing, at a size that does
             not wrap the trail onto three lines. Hidden from assistive
             technology too, for the same reason — it would be the name read
             twice, not a missing landmark. -->
        <li aria-hidden="true" class="hidden items-center sm:flex">
          <app-icon name="chevron-right" class="h-4 w-4 text-stone-300" />
        </li>
        <li class="hidden sm:block">
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

      <!-- The four facts that decide it, beside the photo — the head of the
           table below, not a second one, which is what its heading and the
           link under it say between them. Gone entirely where there is no
           third column, since everything in it is still on the page a screen
           further down. -->
      @if (mainAttributes().length) {
        <div class="hidden @min-[65rem]/product:block">
          <h2 [class]="sectionHeading">{{ text.mainSpecifications }}</h2>
          <table class="mt-3 w-full border-t border-border text-sm">
            <tbody class="divide-y divide-border">
              @for (attr of mainAttributes(); track $index) {
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
          <a
            appLink
            class="mt-3 inline-block text-sm"
            [routerLink]="[]"
            [fragment]="specsId"
            queryParamsHandling="preserve"
          >
            {{ text.allSpecifications }}
          </a>
        </div>
      }

      <aside [class]="buyColumnClass">
        <app-product-buy-block [item]="item()" [canAdd]="canAdd()" />
      </aside>

      <!-- The seam under the band, drawn only where the band is a band: with
           one column the gap already says it, and a rule across a stack is one
           more line in a page of them. -->
      <div
        aria-hidden="true"
        class="col-span-full hidden border-t border-border @min-[40rem]/product:block"
      ></div>

      @if (item().descriptionHtml) {
        <div [id]="descriptionId" [class]="descriptionCellClass">
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
        <div [id]="specsId" [class]="specsCellClass">
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
                        appLink
                        [routerLink]="['/catalog', item().category.slug]"
                        [queryParams]="{ attr: attr.filterParam }"
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
  /** Nothing but the container it opens: the track caps the panel at 20rem in
   * both of the shapes that have a column for it, and the facts beside it take
   * whatever it leaves. */
  protected readonly buyColumnClass = '@container/buy';
  protected readonly descriptionCellClass = `${PRODUCT_PAGE_SECTION_CELL} ${READING_WIDTH}`;
  protected readonly specsCellClass = `${PRODUCT_PAGE_SECTION_CELL} ${TABLE_WIDTH}`;
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
    'text-xs font-medium tracking-wide text-subtle uppercase';
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

  /** The first few, in the order the product states them — the manager's own
   * order, which is the one the editor's grid is dragged into. */
  protected readonly mainAttributes = computed(() =>
    this.attributes().slice(0, MAIN_SPECS),
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
