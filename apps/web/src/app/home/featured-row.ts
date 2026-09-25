import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  PLATFORM_ID,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { FEATURED_ROW_SIZE } from '@b2b-catalog-platform/shared';
import { EditActions } from '../admin/edit-actions';
import { editAwareContent } from '../admin/edit-aware-content';
import { injectEditorReturnParams } from '../admin/editor-return';
import { anyStatus } from '../catalog/product-status-line';
import { ProductTile } from '../catalog/product-tile';
import { APP_TEXT } from '../config/app-text';
import { Icon } from '../ui/icons/icon';
import { IconButton } from '../ui/icon-button';
import { FeaturedRowService } from './featured-row.service';

/**
 * The white band the row stands on, from one edge of the window to the other,
 * shaded inward from its top edge so it reads as set into the page rather
 * than lying on it. Painted as a border image
 * pushed out past the element rather than by widening it: anything sized to
 * the viewport counts the scrollbar, and the page would scroll sideways by its
 * width. The outset is paint, not layout, so it cannot — and unlike a spread
 * shadow it can reach further sideways than up and down.
 */
const BAND =
  'bg-white [border-image:linear-gradient(#f1f1f1,#f8f8f8_2px,#fff_10px,#fff_calc(100%_-_5px),#f7f7f7)_fill_0//0_100vmax]';

/**
 * One card width at every window width: a listing's column, 15rem, which is
 * what a card's buying controls need side by side. Five of them are exactly
 * the page's width, so a wide screen shows the whole row; a narrower one cuts
 * the last card at the edge, which is what says the row scrolls.
 */
const CARD_WIDTH = 'auto-cols-[15rem]';

/**
 * The main page's row (FR-CAT-09): five products over the categories, as the
 * cards every listing draws, so what can be bought from a listing can be
 * bought from here.
 *
 * A row that does not fit scrolls sideways rather than wrapping or dropping
 * cards, and never moves by itself. The card at the edge showing by half is
 * what says there is more to a thumb; a mouse gets arrows as well, because it
 * has no sideways gesture to discover. The scrollbar is hidden — it would be
 * the only one on the page, under a row that already says it scrolls.
 *
 * Absent when there is nothing to show, never an empty frame.
 */
@Component({
  selector: 'app-featured-row',
  imports: [ProductTile, EditActions, Icon, IconButton],
  template: `
    <!-- A row that failed to load is left out like an empty one: the page
         under it is whole without it, and an error where an invitation was
         meant to be is the worse of the two. -->
    @if (items.error()) {
    } @else if (shown(); as items) {
      @if (items.length) {
        <section [class]="sectionClass" aria-labelledby="featured-heading">
          <div class="mb-4 flex items-center justify-between gap-4">
            <h2
              id="featured-heading"
              class="text-xl font-medium tracking-tight"
            >
              {{ text.heading }}
            </h2>
            <div class="flex items-center gap-3">
              <!-- Only where there is somewhere to go, and only for a pointer
                   that cannot swipe: on a touch screen the half-shown card is
                   the control, and two more buttons would crowd the heading. -->
              @if (canBack() || canForward()) {
                <div class="hidden gap-1 pointer-fine:flex">
                  <button
                    appIconButton
                    size="md"
                    type="button"
                    [disabled]="!canBack()"
                    [attr.aria-label]="text.previous"
                    [attr.aria-controls]="trackId"
                    (click)="page(-1)"
                  >
                    <app-icon name="chevron-right" class="rotate-180" />
                  </button>
                  <button
                    appIconButton
                    size="md"
                    type="button"
                    [disabled]="!canForward()"
                    [attr.aria-label]="text.next"
                    [attr.aria-controls]="trackId"
                    (click)="page(1)"
                  >
                    <app-icon name="chevron-right" />
                  </button>
                </div>
              }
            </div>
          </div>
          <!-- Out to the window's edges, so a card scrolls off the screen
               rather than off the page's column; the padding puts the first
               one back under the heading. The padding above and below is room
               the scroll box would otherwise clip: a card's hover shadow, a
               focus ring, and the bubble the stepper hangs under a card. -->
          @let reserveStatus = anyStatus(items);
          <ul
            #track
            [id]="trackId"
            role="list"
            [class]="trackClass"
            (scroll)="measure()"
          >
            @for (item of items; track item.slug) {
              <li class="h-full snap-start">
                <app-product-tile
                  [item]="item"
                  [reserveStatus]="reserveStatus"
                  [compact]="true"
                >
                  @if (editControls(); as editText) {
                    <app-edit-actions
                      variant="tile"
                      [editLink]="['/admin/products', item.slug, 'edit']"
                      [editParams]="editorFrom()"
                      [editLabel]="editText.editProduct"
                    />
                  }
                </app-product-tile>
              </li>
            }
          </ul>
        </section>
      }
    } @else if (showSkeleton()) {
      <div [class]="sectionClass" aria-hidden="true">
        <div class="mb-4 h-8 w-48 animate-pulse rounded bg-stone-125"></div>
        <ul [class]="skeletonClass">
          @for (i of skeletons; track i) {
            <li class="h-80 animate-pulse rounded-lg bg-stone-125"></li>
          }
        </ul>
      </div>
    }
  `,
})
export class FeaturedRow {
  private readonly featured = inject(FeaturedRowService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly text = inject(APP_TEXT).home.featured;
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly anyStatus = anyStatus;
  protected readonly trackId = 'featured-track';
  protected readonly skeletons = Array.from(
    { length: FEATURED_ROW_SIZE },
    (_, i) => i,
  );

  protected readonly trackClass =
    'grid grid-flow-col gap-5 overflow-x-auto overscroll-x-contain snap-x snap-mandatory ' +
    'motion-safe:scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ' +
    '-mx-4 px-4 pt-1 pb-8 scroll-px-4 ' +
    CARD_WIDTH;
  protected readonly skeletonClass =
    'grid grid-flow-col gap-5 overflow-hidden pt-8 pb-5 ' + CARD_WIDTH;
  /** The band, with the room under it the categories need before they
   * start. */
  protected readonly sectionClass = 'mb-10 pt-5 ' + BAND;

  protected readonly items = resource({
    loader: () => this.featured.row(),
  });

  /** The cards and the edit affordances appear together — see
   * editAwareContent. */
  private readonly content = editAwareContent({
    // `undefined` is also what a render that leaves prices to the browser
    // answers, and that is not ready either.
    ready: computed(() => this.items.hasValue()),
    section: 'editMode',
  });
  protected readonly editControls = this.content.controls;
  protected readonly showSkeleton = this.content.showSkeleton;
  protected readonly shown = computed(() =>
    this.content.ready() ? this.items.value() : undefined,
  );

  private readonly track = viewChild<ElementRef<HTMLElement>>('track');
  protected readonly canBack = signal(false);
  protected readonly canForward = signal(false);

  constructor() {
    // A row that fits needs no arrows, and whether it fits changes with the
    // window, not only with scrolling.
    if (this.isBrowser && typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => this.measure());
      inject(DestroyRef).onDestroy(() => observer.disconnect());
      effect(() => {
        const track = this.track()?.nativeElement;
        observer.disconnect();
        if (track) observer.observe(track);
      });
    }
  }

  protected measure(): void {
    const track = this.track()?.nativeElement;
    if (!track) return;
    // A pixel's slack: a scroll position can land a fraction short of the end.
    this.canBack.set(track.scrollLeft > 1);
    this.canForward.set(
      track.scrollLeft + track.clientWidth < track.scrollWidth - 1,
    );
  }

  /** A screenful at a time; the snap lands it on a card's edge. Smooth only
   * where motion is welcome — the track's CSS decides. */
  protected page(direction: 1 | -1): void {
    const track = this.track()?.nativeElement;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth });
  }
}
