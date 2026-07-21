import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageSlug } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { ConsentService } from '../consent/consent.service';
import { ContactInfo } from './contact-info';

@Component({
  imports: [RouterLink, ContactInfo],
  selector: 'app-footer',
  template: `
    <footer class="border-t border-stone-200 bg-stone-100">
      <div
        class="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-6 text-sm sm:flex-row sm:items-center sm:justify-between"
      >
        <div class="flex flex-col gap-3">
          <p class="text-secondary">
            {{ branding.name }} — {{ text.brand.tagline }}
          </p>
          @if (contact?.phone || contact?.email) {
            <app-contact-info variant="plain" />
          }
        </div>
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
          <!-- Consent withdrawal must be as easy as giving it; shown only when
               the deployment runs the consent banner at all. -->
          @if (consent.enabled) {
            <button
              type="button"
              class="text-left transition-colors hover:text-ink"
              (click)="consent.withdraw()"
            >
              {{ text.consent.settings }}
            </button>
          }
        </nav>
      </div>
    </footer>
  `,
})
export class Footer {
  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(APP_TEXT);
  protected readonly consent = inject(ConsentService);
  protected readonly branding = this.config.branding;
  protected readonly contact = this.config.contact;
  protected readonly legalSlugs: readonly PageSlug[] = [
    'conditions',
    'privacy',
    'imprint',
  ];
}
