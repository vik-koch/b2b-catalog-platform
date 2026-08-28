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
 * The two-column breakpoint (Tailwind `lg`). Above it the specifications table
 * can move under the image; below it the page is a single column and the
 * description is collapsed instead.
 */
const TWO_COLUMN = '(min-width: 64rem)';

/**
 * The product page's columns, shared with the loading placeholder so nothing
 * moves sideways when the real page arrives.
 *
 * Three from lg up: what it looks like, what it is, and how to buy it. The
 * buying column is a fixed 16.25rem — 234px of content inside its p-3 — because
 * everything in it (a three-way selector, a stepper, a packaging line) was
 * sized for that width and stops fitting below it.
 *
 * Below lg the description drops underneath, but the image and the buying
 * column stay side by side down to 576px, the narrowest viewport where the
 * image still clears 234px beside them. Only under that does the page become
 * one column.
 */
export const PRODUCT_PAGE_COLUMNS =
  'grid gap-8 min-[576px]:grid-cols-[minmax(0,1fr)_16.25rem] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_16.25rem]';

/** Where the description and specifications sit in those columns: under both
 * while there are two, in the middle once there are three. */
export const PRODUCT_PAGE_INFO_COLUMN =
  'order-3 min-[576px]:col-span-2 lg:order-2 lg:col-span-1';

/**
 * Spanning the full width under the image, the description and the
 * specifications read as two columns rather than one long scroll — which is
 * also why the description is not collapsed at those widths: side by side,
 * neither block pushes the other off the screen.
 */
const INFO_SIDE_BY_SIDE =
  'sm:max-lg:grid sm:max-lg:grid-cols-2 sm:max-lg:items-start sm:max-lg:gap-8';

/**
 * Where the image stops growing before the page has a third column for the
 * description. Left to the full `1fr` it is a 700px square on a tablet, which
 * is the whole screen for a photo the page has already shown at tile size.
 */
const IMAGE_CAP = 'min-[576px]:max-lg:max-w-96';

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
      <div #imageColumn [class]="imageColumnClass">
        <app-product-gallery
          [images]="item().images"
          [productName]="item().name"
        />

        @if (specsUnderImage()) {
          <ng-container
            [ngTemplateOutlet]="specs"
            [ngTemplateOutletContext]="{ $implicit: 'mt-8' }"
          />
        }
      </div>

      <aside class="order-2 lg:order-3">
        <app-product-buy-block [item]="item()" [canAdd]="canAdd()" />
      </aside>

      <div [class]="infoColumnClass()">
        <div #infoColumn>
          @if (item().descriptionHtml) {
            <div class="relative">
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
          }
        </div>

        @if (!specsUnderImage()) {
          <ng-container
            [ngTemplateOutlet]="specs"
            [ngTemplateOutletContext]="{ $implicit: specsWrapClass() }"
          />
        }
      </div>
    </div>

    <!-- Wrapped in an element of its own, so that where the description and
         the specifications are two grid columns the table is one item rather
         than a heading and a table landing in separate cells. -->
    <ng-template #specs let-wrapClass>
      @if (attributes().length || packagingRows().length) {
        <div [class]="wrapClass">
          <h2 class="text-xs font-semibold tracking-wide text-subtle uppercase">
            {{ text.specifications }}
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
  protected readonly imageColumnClass = `order-1 min-w-0 ${IMAGE_CAP}`;
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

  /** The two blocks stand side by side only where both are there to stand. */
  protected readonly sideBySide = computed(
    () =>
      !!this.item().descriptionHtml &&
      (this.attributes().length > 0 || this.packagingRows().length > 0),
  );
  protected readonly infoColumnClass = computed(() =>
    this.sideBySide()
      ? `${PRODUCT_PAGE_INFO_COLUMN} ${INFO_SIDE_BY_SIDE}`
      : PRODUCT_PAGE_INFO_COLUMN,
  );
  /** The gap over the table is the one between it and the description above —
   * so it goes when the table moves beside the description instead. */
  protected readonly specsWrapClass = computed(() =>
    this.sideBySide() ? 'mt-8 sm:max-lg:mt-0' : 'mt-8',
  );

  protected readonly packagingRows = computed(() =>
    this.units.packagingRows(this.item().boxDimensions),
  );

  private readonly imageColumn =
    viewChild.required<ElementRef<HTMLElement>>('imageColumn');
  private readonly infoColumn =
    viewChild.required<ElementRef<HTMLElement>>('infoColumn');
  private readonly description =
    viewChild<ElementRef<HTMLElement>>('description');

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  /** Live viewport state. Both stay false on the server (and in unit tests),
   * which renders the plain layout: the whole description, specifications
   * beside the image — so crawlers always see the full text. */
  private readonly twoColumn = signal(false);
  private readonly narrow = signal(false);

  /** True while the name/price/description block is at least as tall as the
   * image, which leaves dead space under the gallery for the table to fill. */
  private readonly infoTallerThanImage = signal(false);

  /**
   * On a wide screen the specifications table moves under the image once the
   * description makes the right column the taller one — the table then fills
   * the whitespace beside the description instead of extending the page.
   */
  protected readonly specsUnderImage = computed(
    () => this.twoColumn() && this.infoTallerThanImage(),
  );

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
      // Both adjustments depend on measured heights, so without a layout engine
      // (jsdom, in unit tests) neither is armed and the plain layout stands.
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      this.watch(TWO_COLUMN, this.twoColumn);
      this.watch(NARROW, this.narrow);

      // Heights change with the image loading, the viewport resizing and the
      // description expanding, so measure continuously rather than once.
      const observer = new ResizeObserver(() => this.measure());
      observer.observe(this.imageColumn().nativeElement);
      observer.observe(this.infoColumn().nativeElement);
      const desc = this.description()?.nativeElement;
      if (desc) {
        observer.observe(desc);
      }
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
    // The image column carries the table once it moves, so compare against the
    // gallery alone — otherwise the swap would undo itself.
    const gallery =
      this.imageColumn().nativeElement.firstElementChild ??
      this.imageColumn().nativeElement;
    this.infoTallerThanImage.set(
      this.infoColumn().nativeElement.offsetHeight >=
        gallery.getBoundingClientRect().height,
    );

    const desc = this.description()?.nativeElement;
    if (desc && this.descriptionCollapsed()) {
      this.descriptionOverflows.set(desc.scrollHeight > desc.clientHeight + 1);
    }
  }
}
