import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [RouterLink],
  selector: 'app-footer',
  template: `
    <footer class="border-t border-stone-200">
      <div
        class="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-secondary">
          Coffee Kontor — wholesale specialty coffee, Hamburg.
        </p>
        <nav
          class="flex flex-wrap gap-x-4 gap-y-2 text-stone-500"
          aria-label="Legal"
        >
          @for (link of legalLinks; track link.path) {
            <a
              [routerLink]="link.path"
              class="transition-colors hover:text-ink"
            >
              {{ link.label }}
            </a>
          }
        </nav>
      </div>
    </footer>
  `,
})
export class Footer {
  // Content for these pages lands in a follow-up PR; the routes exist.
  legalLinks = [
    { path: '/conditions', label: 'Payment & delivery' },
    { path: '/privacy', label: 'Privacy' },
    { path: '/imprint', label: 'Imprint' },
  ];
}
