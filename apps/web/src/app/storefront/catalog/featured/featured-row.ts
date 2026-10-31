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
import { FEATURED_ROW_SIZE } from '@b2b-catalog-platform/shared/storefront/catalog';
import { IconButton } from '@b2b-catalog-platform/ui/actions/icon-button';
import { chevronRightIcon } from '@b2b-catalog-platform/ui/icons/glyphs/chevron-right';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { STOREFRONT_TEXT } from '../../../shared/config/storefront-text';
import { EditActions } from '../../../shared/edit-mode/edit-actions';
import { editAwareContent } from '../../../shared/edit-mode/edit-aware-content';
import { injectEditorReturnParams } from '../../../shared/edit-mode/editor-return';
import { anyStatus } from '../ui/product-status-line';
import { ProductTile } from '../ui/product-tile';
import { FeaturedRowService } from './featured-row.service';

/** A listing's column at every width. Five fill the page exactly; a narrower
 * window cuts the last card, which says the row scrolls. */
const CARD_WIDTH = 'auto-cols-[15rem]';

/**
 * The main page's row (FR-CAT-09): the cards every listing draws. Too wide, it
 * scrolls sideways and never by itself; a mouse gets arrows, having no
 * sideways gesture. Absent when empty or failed, never an empty frame.
 */
@Component({
  selector: 'app-featured-row',
  imports: [ProductTile, EditActions, Icon, IconButton],
  template: `
    @if (shown(); as items) {
      @if (items.length) {
        <section aria-labelledby="featured-heading">
          <div class="mb-4 flex items-center justify-between gap-4">
            <h2
              id="featured-heading"
              class="text-xl font-medium tracking-tight"
            >
              {{ text.heading }}
            </h2>
            <div class="flex items-center gap-3">
              <!-- Fine pointers only: on touch the half-shown card is the
                   control. -->
              @if (canBack() || canForward()) {
                <div class="hidden gap-1 pointer-fine:flex">
                  <button
                    uiIconButton
                    size="md"
                    type="button"
                    [disabled]="!canBack()"
                    [attr.aria-label]="text.previousAria"
                    [attr.aria-controls]="trackId"
                    (click)="page(-1)"
                  >
                    <ui-icon [glyph]="chevronRightIcon" class="rotate-180" />
                  </button>
                  <button
                    uiIconButton
                    size="md"
                    type="button"
                    [disabled]="!canForward()"
                    [attr.aria-label]="text.nextAria"
                    [attr.aria-controls]="trackId"
                    (click)="page(1)"
                  >
                    <ui-icon [glyph]="chevronRightIcon" />
                  </button>
                </div>
              }
            </div>
          </div>
          <!-- Out to the window's edges, padded back under the heading. The
               padding above and below keeps the scroll box from clipping a
               hover shadow, a focus ring or the stepper's bubble. -->
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
                <!-- The first photos a visitor sees: fetched with the page. -->
                <app-product-tile
                  [item]="item"
                  [reserveStatus]="reserveStatus"
                  [inset]="true"
                  [imagePriority]="$first ? 'high' : 'eager'"
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
    } @else if (showSkeleton() && !items.error()) {
      <div aria-hidden="true">
        <div class="h-8 w-48 animate-pulse rounded-sm bg-skeleton"></div>
        <ul [class]="skeletonClass">
          @for (i of skeletons; track i) {
            <li class="h-116 animate-pulse rounded-lg bg-skeleton"></li>
          }
        </ul>
      </div>
    }
  `,
})
export class FeaturedRow {
  protected readonly chevronRightIcon = chevronRightIcon;
  private readonly featured = inject(FeaturedRowService);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  protected readonly text = inject(STOREFRONT_TEXT).home.featured;
  protected readonly editorFrom = injectEditorReturnParams();
  protected readonly anyStatus = anyStatus;
  protected readonly trackId = 'featured-track';
  protected readonly skeletons = Array.from(
    { length: FEATURED_ROW_SIZE },
    (_, i) => i,
  );

  /** No scrollbar: the half-shown card already says the row scrolls. */
  protected readonly trackClass = `grid grid-flow-col gap-5 overflow-x-auto
    overscroll-x-contain snap-x snap-mandatory motion-safe:scroll-smooth
    [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 pt-1 pb-8
    scroll-px-4 ${CARD_WIDTH}`;
  protected readonly skeletonClass =
    'grid grid-flow-col gap-5 overflow-hidden pt-4 pb-5 ' + CARD_WIDTH;

  protected readonly items = resource({
    loader: () => this.featured.row(),
  });

  private readonly content = editAwareContent({
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
    // Whether the row fits changes with the window, not only with scrolling.
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

  /** A screenful at a time; the snap lands it on a card's edge. */
  protected page(direction: 1 | -1): void {
    const track = this.track()?.nativeElement;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth });
  }
}
