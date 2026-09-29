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
import { ProductListItem } from '@b2b-catalog-platform/shared';
import { filter } from 'rxjs';
import { APP_TEXT } from '../config/app-text';
import { delayedLoading } from '../core/delayed-loading';
import { Button } from '../ui/button';
import { DialogActions } from '../ui/dialog-actions';
import { DialogPanel } from '../ui/dialog-panel';
import { Skeleton } from '../ui/skeleton';
import { CatalogService } from './catalog.service';
import { PairingsService } from './pairings.service';
import { PRODUCT_ROWS, ProductRow } from './product-row';
import { WarningNote } from '../ui/warning-note';

/**
 * What a sold-together marker opens (FR-SET-05): the counterparts as product
 * rows, each with the buying controls it was listed with, so they can be added
 * from where the marker was pressed.
 *
 * **A modal, not a bubble.** What it holds is rows carrying buying controls,
 * which need most of the width of a phone before they are laid out at all; a
 * bubble hanging off a 20px glyph that turns out to be the width of the page is
 * a bubble in name only, and on a phone it would have had to become a modal
 * regardless. One panel, one drawing, both viewports — the rows inside take
 * their stacked shape at this width either way.
 *
 * Esc and a Close button, as every other modal here. Nothing closes on the
 * backdrop: a customer who learned that on the delete confirmation should not
 * have to learn something else here.
 *
 * The rows inside carry no marker of their own. The counterpart of a lid is the
 * cup that was already on screen, so a second hop walks back to where it
 * started — and a modal has no history to walk back through.
 *
 * Following a row's link moves the panel with the page: the product now on
 * screen is the one whose counterparts it lists. The rows it had stay up until
 * the new ones arrive, so the panel neither closes and reopens nor empties.
 *
 * It opens on its content, not before it. The marker starts the request and
 * the panel appears with the rows already in it — a modal that arrives empty
 * and fills in a beat later moves everything the customer was about to press.
 * A request slow enough to be worth admitting to opens on the skeleton instead,
 * so the press is never simply ignored.
 *
 * Drawn once by the shell rather than by each of the several dozen markers a
 * listing puts on screen; PairingsService says which product is open.
 */
@Component({
  selector: 'app-product-pairings-dialog',
  imports: [
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
        appDialogPanel
        size="xl"
        aria-labelledby="pairings-heading"
        (cancel)="close()"
      >
        <h2 id="pairings-heading" class="text-xl font-normal tracking-tight">
          {{ text.label }}
        </h2>
        <p class="mt-2 text-sm text-muted">{{ text.intro }}</p>

        @if (rows(); as rows) {
          <ul [class]="rowList" class="mt-4">
            @for (item of rows; track item.slug) {
              <li>
                <!-- No marker on these: the counterpart of a lid is the cup
                     that opened this panel. -->
                <app-product-row [item]="item" [offerPairings]="false" />
              </li>
            }
          </ul>
        } @else if (items.error()) {
          <app-warning-note class="mt-4">
            {{ text.loadError }}
          </app-warning-note>
        } @else if (showSkeleton()) {
          <!-- As many placeholders as the marker promised, at a row's height:
               the panel then opens at the size it will settle at instead of
               growing under the pointer as the rows land. -->
          <ul [class]="rowList" class="mt-4">
            @for (row of skeletonRows(); track row) {
              <li>
                <app-skeleton class="mt-3 mb-9.5" [lines]="5" />
              </li>
            }
          </ul>
        }

        <div appDialogActions>
          <button appButton variant="secondary" type="button" (click)="close()">
            {{ text.close }}
          </button>
        </div>
      </dialog>
    }
  `,
})
export class ProductPairingsDialog {
  protected readonly text = inject(APP_TEXT).catalog.pairings;
  protected readonly rowList = PRODUCT_ROWS;
  protected readonly pairings = inject(PairingsService);
  private readonly catalog = inject(CatalogService);
  private readonly router = inject(Router);

  /**
   * Asked when the panel opens and not before: every card in a listing carries
   * a marker, and fetching each one's counterparts to draw an icon would put a
   * screenful of questions to the catalog that nobody has asked.
   *
   * Keyed on the slug, so the answer to one product can never be shown under
   * another's marker.
   */
  protected readonly items = resource({
    params: () => this.pairings.open() ?? undefined,
    loader: async ({ params }) =>
      (await this.catalog.getProductPairings(params.slug)) ?? [],
  });

  /**
   * Shorter than the page-wide delay: a modal that has not appeared yet is a
   * press with nothing at all on screen to show for it, where a page at least
   * still has the page. Long enough that a local answer opens the panel
   * complete, short enough that a slow one does not read as a dead control.
   */
  protected readonly showSkeleton = delayedLoading(this.items.isLoading, 150);

  /** The counterparts have arrived, or the wait is worth admitting to. */
  private readonly answered = computed(
    () => this.items.hasValue() || this.items.error() !== undefined,
  );
  /** Once up, up until closed: moving to another product must not take it
   * down while the new rows load — a <dialog> drawn again opens again, and
   * focus starts over. */
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

  /**
   * The rows on screen: the answer once it is in, the last one while the next
   * is on its way. Cleared on close, so a panel opened for another product
   * never starts on the rows of the one before.
   */
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

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    // `showModal()` has to be called imperatively for the focus trap, the
    // backdrop and the top layer; the `@if` in the template is what closes it
    // again, a removed <dialog> being a closed one.
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

  /** After a row's link: list the counterparts of the product it opened, or
   * close if it has none. Any other navigation leaves the panel as it is. */
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

  /**
   * One placeholder per counterpart the marker promised. At least one, because
   * a panel that is open is a panel with something coming; the count is only
   * ever wrong if the catalog changed under the marker, and the rows replace
   * these wholesale either way.
   */
  protected readonly skeletonRows = computed(() =>
    Array.from(
      { length: Math.max(1, this.pairings.open()?.count ?? 1) },
      (_, i) => i,
    ),
  );

  protected close(): void {
    this.pairings.close();
  }
}
