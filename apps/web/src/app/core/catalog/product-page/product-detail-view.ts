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
} from '@b2b-catalog-platform/shared/core/catalog';
import { EDIT_ACTIONS_INSET } from '../../../shared/edit-mode/edit-actions';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { SHARED_TEXT } from '../../../shared/config/shared-text';
import { trustedRichText } from '../../../shared/core/trusted-rich-text';
import { disclosureState } from '@b2b-catalog-platform/ui/disclosure/disclosure-state';
import { ShowMoreToggle } from '@b2b-catalog-platform/ui/disclosure/show-more-toggle';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { Link } from '@b2b-catalog-platform/ui/actions/link';
import { TextButton } from '@b2b-catalog-platform/ui/actions/text-button';
import { ProductBuyBlock } from './product-buy-block';
import { ProductDocuments } from './product-documents';
import { ProductVariantGallery } from './product-variant-gallery';
import { ProductVariantList } from './product-variant-list';
import { useProductUnits } from '../buying/product-units-view';
import { chevronRightIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-right';

/**
 * The product page's band: photo, main facts, buying panel; the readings go
 * in rows under it.
 *
 * - The photo's track is `max-content`, sized to the gallery (30rem with
 *   thumbnails, 25 without). It must not share: grid grows tracks in equal
 *   shares, which squeezed the gallery and pushed its thumbnails off the edge.
 * - The panel caps at 20rem and gives up five first; the facts take the rest.
 * - Both right-hand tracks floor at 15rem, so the facts appear at 65rem
 *   (30 + 15 + 15 + two gutters). Below that the band is photo and panel held
 *   apart, below 40rem one column.
 *
 * Container queries, not the window: the admin's preview draws this page in an
 * editor column.
 */
export const PRODUCT_PAGE_COLUMNS =
  'grid gap-x-10 gap-y-8 ' +
  '@min-[40rem]/product:justify-between ' +
  '@min-[40rem]/product:grid-cols-[minmax(0,30rem)_minmax(15rem,20rem)] ' +
  '@min-[65rem]/product:justify-normal ' +
  '@min-[65rem]/product:grid-cols-[max-content_minmax(15rem,1fr)_minmax(15rem,20rem)]';

/** A row each under the band, set to the section's own measure. */
export const PRODUCT_PAGE_SECTION_CELL = 'col-span-full scroll-mt-24';
/** Wider than a book's line: a few paragraphs and a list broke into a ribbon
 * at 3xl. The rule gives the column a bottom edge. */
const READING_WIDTH = 'max-w-3xl border-b border-edge pb-8';
const TABLE_WIDTH = 'max-w-xl';

/** Facts beside the photo: a glance, the rest is the table. */
const MAIN_SPECS = 4;

/** Below `sm` the description collapses behind a show-more. */
const NARROW = '(width < 40rem)';

/**
 * The product page from a resolved product, loading nothing: the storefront
 * route wraps it, and the admin editor's preview is this same view.
 */
@Component({
  selector: 'app-product-detail-view',
  // The page width is the component's, not the route's, so the preview is the
  // same page; a container, so it lays out by the room it has.
  host: { class: 'block @container/product max-w-7xl' },
  imports: [
    RouterLink,
    ProductVariantGallery,
    ProductVariantList,
    ProductBuyBlock,
    Icon,
    Link,
    TextButton,
    NgTemplateOutlet,
    ShowMoreToggle,
    ProductDocuments,
  ],
  template: `
    <nav
      [attr.aria-label]="text.catalogRoot"
      [class]="crumbInset() ? editActionsInset : ''"
    >
      <!-- Inline, not flex: a flexed crumb drops whole onto the next line. -->
      <ol role="list" class="text-sm text-ink-subtle">
        <li class="inline">
          <a routerLink="/catalog" class="hover:text-accent">
            {{ text.catalogRoot }}
          </a>
        </li>
        @for (crumb of item().category.ancestors; track crumb.slug) {
          <li aria-hidden="true" class="inline">
            <ui-icon
              [glyph]="chevronRightIcon"
              class="mx-1 size-4 align-middle text-edge-strong"
            />
          </li>
          <li class="inline">
            <a
              [routerLink]="['/catalog', crumb.slug]"
              class="hover:text-accent"
            >
              {{ displayName(crumb) }}
            </a>
          </li>
        }
        <li aria-hidden="true" class="inline">
          <ui-icon
            [glyph]="chevronRightIcon"
            class="mx-1 size-4 align-middle text-edge-strong"
          />
        </li>
        <li class="inline">
          <a
            [routerLink]="['/catalog', item().category.slug]"
            class="hover:text-accent"
          >
            {{ displayName(item().category) }}
          </a>
        </li>
        <!-- The product's crumb goes on a phone, where the <h1> under it says
             the same; hidden from assistive technology, as the name twice. -->
        <li aria-hidden="true" class="hidden sm:inline">
          <ui-icon
            [glyph]="chevronRightIcon"
            class="mx-1 size-4 align-middle text-edge-strong"
          />
        </li>
        <li class="hidden sm:inline">
          <span aria-current="page" class="font-medium text-ink">
            {{ item().name }}
          </span>
        </li>
      </ol>
    </nav>

    <!-- Above the columns, over the whole page. productStatus is where an
         admin's page says the public cannot see it (FR-ADM-06). -->
    <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
      <h1 class="text-2xl font-medium tracking-tight sm:text-3xl">
        {{ item().name }}
      </h1>
      <ng-content select="[productStatus]" />
    </div>

    <div [class]="columnsClass">
      <div [class]="imageColumnClass">
        <app-product-variant-gallery
          #variantGallery
          [images]="item().images"
          [variants]="item().variants"
          [productName]="item().name"
          listWhere="@min-[65rem]/product:hidden"
        />
      </div>

      <!-- The head of the table below, gone with the third column. The
           variants stand under it, beside the pictures they move (FR-CAT-11);
           without the column the gallery draws them. -->
      @if (mainAttributes().length || item().variants.length) {
        <div class="hidden @min-[65rem]/product:block">
          @if (mainAttributes().length) {
            <h2 [class]="sectionHeading">{{ text.mainSpecifications }}</h2>
            <table class="mt-3 w-full border-t border-edge text-sm">
              <tbody class="divide-y divide-edge">
                @for (attr of mainAttributes(); track $index) {
                  <tr>
                    <th
                      scope="row"
                      class="py-2 pr-4 text-left font-normal text-ink-subtle"
                    >
                      {{ attr.key }}
                    </th>
                    <td class="py-2 text-right text-ink">
                      <ng-container
                        [ngTemplateOutlet]="attributeValue"
                        [ngTemplateOutletContext]="{ $implicit: attr }"
                      />
                    </td>
                  </tr>
                }
              </tbody>
            </table>
            <a
              uiTextButton
              class="mt-3 inline-block text-sm"
              [routerLink]="[]"
              [fragment]="specsId"
              queryParamsHandling="preserve"
            >
              {{ text.allSpecifications }}
            </a>
          }
          @if (item().variants.length) {
            <app-product-variant-list
              class="block contain-inline-size"
              [class.mt-8]="mainAttributes().length > 0"
              [variants]="item().variants"
              [images]="item().images"
              [current]="variantGallery.current()"
              (pick)="variantGallery.show($event)"
            />
          }
        </div>
      }

      <aside [class]="buyColumnClass">
        <app-product-buy-block [item]="item()" [canAdd]="canAdd()" />
      </aside>

      <!-- Only where the band has columns: in a stack the gap says it. -->
      <div
        aria-hidden="true"
        class="col-span-full hidden border-t border-edge
               @min-[40rem]/product:block"
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
              {{ product.description }}
            </a>
          </h2>
          <div class="relative mt-3">
            <div
              #description
              [id]="descriptionTextId"
              class="prose max-w-none"
              [class]="descriptionClass()"
              [style.--desc-full]="descriptionFullHeight()"
              [innerHTML]="safeDescription(item().descriptionHtml)"
            ></div>
            @if (descriptionFaded()) {
              <div
                aria-hidden="true"
                class="pointer-events-none absolute inset-x-0 bottom-0 h-12
                       bg-linear-to-t from-surface-subtle to-surface-subtle/0"
              ></div>
            }
          </div>
          @if (descriptionToggle()) {
            <ui-show-more-toggle
              class="mt-1"
              [expanded]="descriptionExpanded()"
              [controls]="descriptionTextId"
              (toggled)="descriptionDisclosure.toggle()"
            />
          }
        </div>
      }

      <ng-container [ngTemplateOutlet]="specs" />

      <!-- Absent with nothing current: an empty heading would say "no papers",
           which an expired certificate does not mean. -->
      @if (item().documents.length) {
        <div [id]="documentsId" [class]="specsCellClass">
          <h2 [class]="sectionHeading">
            <a
              [routerLink]="[]"
              [fragment]="documentsId"
              queryParamsHandling="preserve"
              [class]="sectionAnchor"
            >
              {{ product.documents }}
            </a>
          </h2>
          <app-product-documents [documents]="item().documents" />
        </div>
      }
    </div>

    <!-- One element, so heading and table land in one grid cell. -->
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
          <!-- A table, not a dl: copied rows paste as TSV into a spreadsheet
               or the editor's attribute grid. -->
          <table class="mt-3 w-full border-t border-edge text-sm">
            <tbody class="divide-y divide-edge">
              @for (attr of attributes(); track $index) {
                <tr>
                  <th
                    scope="row"
                    class="py-2 pr-4 text-left font-normal text-ink-subtle"
                  >
                    {{ attr.key }}
                  </th>
                  <td class="py-2 text-right text-ink">
                    <ng-container
                      [ngTemplateOutlet]="attributeValue"
                      [ngTemplateOutletContext]="{ $implicit: attr }"
                    />
                  </td>
                </tr>
              }
              <!-- What it is, then how it ships. -->
              @for (row of packagingRows(); track row.label) {
                <tr>
                  <th
                    scope="row"
                    class="py-2 pr-4 text-left font-normal text-ink-subtle"
                  >
                    {{ row.label }}
                  </th>
                  <td class="py-2 text-right text-ink">
                    {{ row.value }}
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </ng-template>

    <!-- One cell for both tables. A filterable value links to its category
         narrowed to it (FR-ATTR-08). -->
    <ng-template #attributeValue let-attr>
      @if (attr.filterParam) {
        <a
          uiLink
          [routerLink]="['/catalog', item().category.slug]"
          [queryParams]="{ attr: attr.filterParam }"
        >
          {{ attr.value }}
        </a>
      } @else {
        {{ attr.value }}
      }
    </ng-template>
  `,
})
export class ProductDetailView {
  protected readonly chevronRightIcon = chevronRightIcon;
  protected readonly text = inject(STOREFRONT_TEXT).catalog;
  protected readonly product = inject(SHARED_TEXT).product;
  protected readonly columnsClass = `${PRODUCT_PAGE_COLUMNS} mt-6`;
  /** The gallery caps itself; see ProductGallery. */
  protected readonly imageColumnClass = 'min-w-0 w-full';
  /** The track caps the panel. */
  protected readonly buyColumnClass = '@container/buy';
  protected readonly descriptionCellClass = `${PRODUCT_PAGE_SECTION_CELL} ${READING_WIDTH}`;
  protected readonly specsCellClass = `${PRODUCT_PAGE_SECTION_CELL} ${TABLE_WIDTH}`;
  protected readonly sectionHeading =
    'text-xs font-medium tracking-wide text-ink-subtle uppercase';
  /** Each heading links to its section, as a router link with a fragment: a
   * bare `href="#id"` resolves against `<base href="/">` to the site root. The
   * router keeps the query string, which carries the editor's return path. */
  protected readonly sectionAnchor = 'transition-colors hover:text-accent';
  protected readonly descriptionId = 'description';
  protected readonly specsId = 'specifications';
  protected readonly documentsId = 'documents';
  /** Sanitized by the server, as pages are. */
  protected readonly safeDescription = trustedRichText();

  readonly item = input.required<ProductDetail>();
  /** False in the editor's preview, which shows the panel but sells nothing. */
  readonly canAdd = input(true);
  /** Edit mode's cluster is pinned beside the breadcrumb: keep clear of it. */
  readonly crumbInset = input(false);
  protected readonly editActionsInset = EDIT_ACTIONS_INSET;

  /** Crumbs sit next to their parent, so the nickname is enough. */
  protected readonly displayName = categoryDisplayName;

  private readonly units = useProductUnits();
  /** An empty value is an old stored row, and would print a dangling label. */
  protected readonly attributes = computed(() =>
    this.item()
      .attributes.filter((a) => a.value.trim() !== '')
      // The unit is the definition's, joined here (FR-ATTR-01); the link is
      // written from the stored value, which the facet is keyed by.
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

  /** In the manager's own order, as dragged in the editor. */
  protected readonly mainAttributes = computed(() =>
    this.attributes().slice(0, MAIN_SPECS),
  );

  protected readonly packagingRows = computed(() =>
    this.units.packagingRows(this.item().packaging, this.item().boxDimensions),
  );

  private readonly description =
    viewChild<ElementRef<HTMLElement>>('description');

  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly destroyRef = inject(DestroyRef);

  /**
   * False on the server and in the first browser render, so crawlers get the
   * whole text and hydration sees the server's markup; armed after it. Not
   * `injectNarrowScreen`, which answers in the constructor.
   */
  private readonly narrow = signal(false);

  /** Armed only while the toggle's own movement runs, so turning the phone
   * changes the clip with no transition on the element. */
  protected readonly descriptionDisclosure = disclosureState(200);
  protected readonly descriptionExpanded = this.descriptionDisclosure.open;
  /** The collapsed description has more to reveal. */
  private readonly descriptionOverflows = signal(false);
  /** The open state's `max-height`: a transition to `none` does not run.
   * Unmeasured, the fallback leaves the text unclipped. */
  protected readonly descriptionFullHeight = signal<string | null>(null);
  protected readonly descriptionTextId = 'description-text';

  protected readonly descriptionCollapsed = computed(
    () => this.narrow() && !this.descriptionExpanded(),
  );
  /** Text that fits the cap is not faded, or it looks cut off. */
  protected readonly descriptionFaded = computed(
    () => this.descriptionCollapsed() && this.descriptionOverflows(),
  );
  /**
   * Only on a phone. Both states are lengths, the open one the measured height
   * with slack. `-m-1 p-1` keeps `overflow-hidden` from cutting a focus
   * outline on the last visible line.
   */
  protected readonly descriptionClass = computed(() => {
    if (!this.narrow()) return '';
    const move = this.descriptionDisclosure.animated()
      ? ' transition-[max-height] duration-200 ease-out'
      : '';
    const cap = this.descriptionCollapsed()
      ? 'max-h-[8.75rem]'
      : 'max-h-[calc(var(--desc-full,100rem)+0.5rem)]';
    return `overflow-hidden -m-1 p-1${move} ${cap}`;
  });
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
      // Without a layout engine (jsdom) the whole text stands.
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      this.watch(NARROW, this.narrow);

      // Expanding and turning the phone both change the height.
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

  private watch(query: string, target: ReturnType<typeof signal<boolean>>) {
    const list = window.matchMedia(query);
    const update = () => target.set(list.matches);
    update();
    list.addEventListener('change', update);
    this.destroyRef.onDestroy(() => list.removeEventListener('change', update));
  }

  private measure() {
    const desc = this.description()?.nativeElement;
    if (!desc) return;
    if (this.descriptionCollapsed()) {
      this.descriptionOverflows.set(desc.scrollHeight > desc.clientHeight + 1);
    }
    // scrollHeight is the whole text's even while the cap hides its end.

    this.descriptionFullHeight.set(`${desc.scrollHeight}px`);
  }
}
