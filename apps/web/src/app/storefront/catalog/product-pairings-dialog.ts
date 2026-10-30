import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  linkedSignal,
  resource,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { ProductListItem } from '@b2b-catalog-platform/shared/core/catalog';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Skeleton } from '@b2b-catalog-platform/ui/content/skeleton';
import { WarningNote } from '@b2b-catalog-platform/ui/content/warning-note';
import { DialogActions } from '@b2b-catalog-platform/ui/overlay/dialog-actions';
import { DialogPanel } from '@b2b-catalog-platform/ui/overlay/dialog-panel';
import { filter } from 'rxjs';
import { PairingsService } from '../../core/catalog/buying/pairings.service';
import { SHARED_TEXT } from '../../shared/config/shared-text';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { delayedLoading } from '../../shared/core/delayed-loading';
import { CatalogService } from './catalog.service';
import { PRODUCT_ROWS, ProductRow } from './ui/product-row';
import { DialogTitle } from '@b2b-catalog-platform/ui/overlay/dialog-title';

/**
 * What a sold-together marker opens (FR-SET-05): the counterparts as product
 * rows with their buying controls. A modal, not a bubble: rows with controls
 * need a phone's width. Nothing closes on the backdrop, as on every modal here.
 *
 * Following a row's link moves the panel along: the rows stay until the new
 * product's arrive. Drawn once by the shell; PairingsService says which product
 * is open.
 */
@Component({
  selector: 'app-product-pairings-dialog',
  imports: [
    DialogTitle,
    WarningNote,
    Button,
    DialogActions,
    DialogPanel,
    ProductRow,
    Skeleton,
  ],
  template: `
    @if (visible()) {
      <dialog
        #dialog
        uiDialogPanel
        size="xl"
        aria-labelledby="pairings-heading"
        (cancel)="close()"
      >
        <h2 id="pairings-heading" uiDialogTitle>
          {{ pairingsName }}
        </h2>
        <p class="mt-2 text-sm text-ink-subtle">{{ text.intro }}</p>

        @if (rows(); as rows) {
          <ul [class]="rowList" class="mt-4">
            @for (item of rows; track item.slug) {
              <li>
                <!-- No marker: the counterpart of a lid is the cup that
                     opened this panel, and a modal has no way back. -->
                <app-product-row [item]="item" [offerPairings]="false" />
              </li>
            }
          </ul>
        } @else if (items.error()) {
          <ui-warning-note class="mt-4">
            {{ text.loadError }}
          </ui-warning-note>
        } @else if (showSkeleton()) {
          <!-- One per counterpart, at a row's height, so the panel opens at
               the size it settles at. -->
          <ul [class]="rowList" class="mt-4">
            @for (row of skeletonRows(); track row) {
              <li>
                <ui-skeleton class="mt-3 mb-9.5" [lines]="5" />
              </li>
            }
          </ul>
        }

        <div uiDialogActions>
          <button uiButton variant="secondary" type="button" (click)="close()">
            {{ actionText.close }}
          </button>
        </div>
      </dialog>
    }
  `,
})
export class ProductPairingsDialog {
  protected readonly text = inject(STOREFRONT_TEXT).catalog.pairings;
  protected readonly pairingsName = inject(SHARED_TEXT).product.pairings;
  protected readonly actionText = inject(SHARED_TEXT).actions;
  protected readonly rowList = PRODUCT_ROWS;
  protected readonly pairings = inject(PairingsService);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);

  /** Asked when the panel opens, never per marker drawn. */
  protected readonly items = resource({
    params: () => this.pairings.open() ?? undefined,
    loader: async ({ params }) =>
      (await this.catalog.getProductPairings(params.slug)) ?? [],
  });

  /** The panel opens on its rows, or on this skeleton once the wait shows.
   * Shorter than the page-wide delay: until the modal appears, the press has
   * nothing on screen to show for it. */
  protected readonly showSkeleton = delayedLoading(this.items.isLoading, 150);

  private readonly answered = computed(
    () => this.items.hasValue() || this.items.error() !== undefined,
  );
  /** Up until closed: moving to another product must not redraw the <dialog>,
   * which would open it again and restart focus. */
  protected readonly visible = linkedSignal<
    { open: boolean; ready: boolean },
    boolean
  >({
    source: () => ({
      open: this.pairings.open() !== null,
      ready: this.answered() || this.showSkeleton(),
    }),
    computation: ({ open, ready }, previous) =>
      open && (ready || previous?.value === true),
  });

  /** The last answer while the next loads; cleared on close, so another
   * product's panel never starts on these rows. */
  protected readonly rows = linkedSignal<
    { open: boolean; failed: boolean; value: ProductListItem[] | undefined },
    ProductListItem[] | undefined
  >({
    source: () => ({
      open: this.pairings.open() !== null,
      failed: this.items.error() !== undefined,
      value: this.items.hasValue() ? this.items.value() : undefined,
    }),
    computation: ({ open, failed, value }, previous) => {
      if (!open || failed) return undefined;
      const rows = value ?? previous?.value;
      return rows?.length ? rows : undefined;
    },
  });

  /** At least one: an open panel always has something coming. */
  protected readonly skeletonRows = computed(() =>
    Array.from(
      { length: Math.max(1, this.pairings.open()?.count ?? 1) },
      (_, i) => i,
    ),
  );

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // `showModal()` for the focus trap and the top layer; the `@if` closes it,
    // a removed <dialog> being a closed one.
    afterRenderEffect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (dialog && !dialog.open) dialog.showModal();
    });

    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((event) => this.follow(event.urlAfterRedirects));
  }

  /** After a row's link: that product's counterparts, or close where it has
   * none. Any other navigation leaves the panel be. */
  private follow(url: string): void {
    if (this.pairings.open() === null) return;
    const [page, slug] =
      this.router.parseUrl(url).root.children['primary']?.segments ?? [];
    if (page?.path !== 'product' || !slug) return;
    const row = this.rows()?.find((item) => item.slug === slug.path);
    if (!row) return;
    if (row.pairedCount > 0) this.pairings.show(row.slug, row.pairedCount);
    else this.pairings.close();
  }

  protected close(): void {
    this.pairings.close();
  }
}
