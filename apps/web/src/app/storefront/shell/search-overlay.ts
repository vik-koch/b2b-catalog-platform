import { Component, computed, HostListener, inject } from '@angular/core';
import { Icon } from '@b2b-catalog-platform/ui/icons/icon';
import { withExitAnimation } from './leave-animation';
import { MobileSearch } from '../platform/mobile-search';
import { SearchField } from '../catalog/search/search-field';
import { xIcon } from '@b2b-catalog-platform/ui/icons/glyphs/x';
import { STOREFRONT_CATALOG_TEXT } from '../catalog/catalog-text';

/** The search field over the dimmed, held page below `sm`, once the header's
 * has scrolled away: the header's height and place, dropping in from the top
 * as the header fetched back. */
@Component({
  selector: 'app-search-overlay',
  imports: [Icon, SearchField],
  host: { class: 'sm:hidden' },
  template: `
    @if (shown()) {
      <div [class]="rowClasses()">
        <app-search-field
          class="min-w-0 flex-1"
          [autoFocus]="true"
          [sheet]="true"
        />
        <button
          type="button"
          class="-mr-1.5 inline-flex cursor-pointer items-center
                 justify-center rounded-lg p-2 text-primary transition-colors
                 hover:text-accent
                 active:text-primary-press"
          (click)="search.close()"
        >
          <ui-icon [glyph]="xIcon" class="size-6" />
          <span class="sr-only">{{ text.closeSearchAria }}</span>
        </button>
      </div>
      <!-- The dimmed page is a way out too: a button, after the row so focus
           reaches the field first, and above everything on the page's edges. -->
      <button type="button" [class]="scrimClasses()" (click)="search.close()">
        <span class="sr-only">{{ text.closeSearchAria }}</span>
      </button>
    }
  `,
})
export class SearchOverlay {
  protected readonly xIcon = xIcon;
  protected readonly search = inject(MobileSearch);
  protected readonly text = inject(STOREFRONT_CATALOG_TEXT).search;

  private readonly exit = withExitAnimation(this.search.open);
  protected readonly shown = this.exit.shown;
  private readonly leaving = this.exit.leaving;

  private readonly row = `fixed inset-x-0 top-0 z-60 flex h-15 items-center
                          gap-2 border-b border-edge bg-surface-subtle/85
                          backdrop-blur px-4
                          motion-reduce:animate-none`;
  private readonly scrim = `fixed inset-0 z-50 cursor-default bg-black/40
                            backdrop-blur-[2px]
                            motion-reduce:animate-none`;

  protected readonly rowClasses = computed(
    () =>
      `${this.row} ${this.leaving() ? 'animate-search-lift' : 'animate-search-drop'}`,
  );
  protected readonly scrimClasses = computed(
    () =>
      `${this.scrim} ${this.leaving() ? 'animate-search-clear' : 'animate-search-dim'}`,
  );

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.search.close();
  }
}
