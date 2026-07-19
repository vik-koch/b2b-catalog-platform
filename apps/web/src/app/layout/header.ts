import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

// TODO: logo.svg and the persona name are deployment branding and will move
// to the same config seam as the theme tokens.
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
          aria-label="Coffee Kontor — home"
          (click)="menuOpen.set(false)"
        >
          <!-- Plain <img>: NgOptimizedImage adds nothing for a local SVG.
               Intrinsic width/height prevent layout shift; CSS scales it. -->
          <img
            src="/logo.svg"
            alt=""
            width="180"
            height="40"
            class="h-8 w-auto"
          />
        </a>

        <nav class="hidden gap-6 text-sm md:flex" aria-label="Main">
          @for (link of navLinks; track link.path) {
            <a
              [routerLink]="link.path"
              routerLinkActive="text-primary font-medium"
              class="text-stone-600 transition-colors hover:text-ink"
            >
              {{ link.label }}
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
          @for (link of navLinks; track link.path) {
            <a
              [routerLink]="link.path"
              routerLinkActive="text-primary font-medium"
              class="block px-4 py-3 text-stone-600 hover:bg-stone-100"
              (click)="menuOpen.set(false)"
            >
              {{ link.label }}
            </a>
          }
        </nav>
      }
    </header>
  `,
})
export class Header {
  menuOpen = signal(false);

  // The logo is the home link; no separate "Home" entry.
  navLinks = [{ path: '/about', label: 'About us' }];
}
