import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageSlug } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';

@Component({
  imports: [RouterLink],
  selector: 'app-footer',
  template: `
    <footer class="border-t border-stone-200">
      <div
        class="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <p class="text-secondary">
          {{ branding.name }} — {{ text.brand.tagline }}
        </p>
        <nav
          class="flex flex-wrap gap-x-4 gap-y-2 text-stone-500"
          aria-label="Legal"
        >
          @for (slug of legalSlugs; track slug) {
            <a
              [routerLink]="'/' + slug"
              class="transition-colors hover:text-ink"
            >
              {{ text.nav[slug] }}
            </a>
          }
        </nav>
      </div>
    </footer>
  `,
})
export class Footer {
  protected readonly text = inject(APP_TEXT);
  protected readonly branding = inject(DEPLOYMENT_CONFIG).branding;
  protected readonly legalSlugs: readonly PageSlug[] = [
    'conditions',
    'privacy',
    'imprint',
  ];
}
