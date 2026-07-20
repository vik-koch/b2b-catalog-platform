import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { PageSlug } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';

@Component({
  imports: [RouterLink, RouterLinkActive],
  selector: 'app-header',
  template: `
    <header
      class="sticky top-0 z-10 border-b border-stone-200 bg-surface/90 backdrop-blur"
    >
      <div
        class="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4"
      >
        <a
          routerLink="/"
          [attr.aria-label]="branding.name + ' — home'"
          (click)="menuOpen.set(false)"
        >
          <!-- Plain <img>: NgOptimizedImage adds nothing for a local SVG.
               Intrinsic width/height prevent layout shift; CSS scales it. -->
          <img
            [src]="branding.logo"
            alt=""
            width="180"
            height="40"
            class="h-8 w-auto"
          />
        </a>

        <nav class="hidden gap-6 text-sm md:flex" aria-label="Main">
          @for (slug of navSlugs; track slug) {
            <a
              [routerLink]="'/' + slug"
              routerLinkActive="text-primary font-medium"
              class="text-stone-600 transition-colors hover:text-ink"
            >
              {{ text.nav[slug] }}
            </a>
          }
        </nav>

        <button
          type="button"
          class="-mr-2 rounded-md p-2 text-stone-600 hover:bg-stone-100 md:hidden"
          [attr.aria-expanded]="menuOpen()"
          aria-controls="mobile-menu"
          aria-label="Toggle menu"
          (click)="menuOpen.set(!menuOpen())"
        >
          <svg
            class="h-5 w-5"
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          >
            @if (menuOpen()) {
              <path d="M5 5l10 10M15 5L5 15" />
            } @else {
              <path d="M3 5h14M3 10h14M3 15h14" />
            }
          </svg>
        </button>
      </div>

      @if (menuOpen()) {
        <nav
          id="mobile-menu"
          class="border-t border-stone-200 md:hidden"
          aria-label="Main"
        >
          @for (slug of navSlugs; track slug) {
            <a
              [routerLink]="'/' + slug"
              routerLinkActive="text-primary font-medium"
              class="block px-4 py-3 text-stone-600 hover:bg-stone-100"
              (click)="menuOpen.set(false)"
            >
              {{ text.nav[slug] }}
            </a>
          }
        </nav>
      }
    </header>
  `,
})
export class Header {
  menuOpen = signal(false);

  protected readonly text = inject(APP_TEXT);
  protected readonly branding = inject(DEPLOYMENT_CONFIG).branding;
  protected readonly navSlugs: readonly PageSlug[] = ['about'];
}
