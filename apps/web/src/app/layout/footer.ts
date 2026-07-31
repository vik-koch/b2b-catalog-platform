import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { ConsentService } from '../consent/consent.service';
import { Button } from '../ui/button';
import { ContactInfo } from './contact-info';

@Component({
  imports: [RouterLink, RouterLinkActive, Button, ContactInfo],
  selector: 'app-footer',
  template: `
    <footer class="border-t border-border bg-stone-100">
      <div class="mx-auto w-full max-w-7xl px-4 py-6 text-sm">
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          @if (contact?.phone || contact?.email) {
            <app-contact-info />
          }
          <!-- The call to action sits on the same line as the legal links, but
               outside the <nav>: it is not a legal link, and a nav of three
               quiet links plus one filled button reads as one row either way. -->
          <div
            class="flex flex-wrap items-center gap-x-4 gap-y-2 sm:justify-end"
          >
            <a appButton routerLink="/inquiry">{{ text.nav['inquiry'] }}</a>
            <nav
              class="flex flex-wrap items-center gap-x-4 gap-y-2 text-subtle"
              [attr.aria-label]="text.a11y.legalNav"
            >
              @for (slug of legalSlugs; track slug) {
                <a
                  [routerLink]="'/' + slug"
                  routerLinkActive
                  ariaCurrentWhenActive="page"
                  [attr.data-label]="text.nav[slug]"
                  class="text-stable transition-colors hover:text-accent aria-[current=page]:font-medium aria-[current=page]:text-primary"
                >
                  {{ text.nav[slug] }}
                </a>
              }
              <!-- Consent withdrawal must be as easy as giving it; shown only
                   when the deployment runs the consent banner at all. -->
              @if (consent.enabled) {
                <button
                  type="button"
                  class="cursor-pointer text-left transition-colors hover:text-accent"
                  (click)="consent.withdraw()"
                >
                  {{ text.consent.settings }}
                </button>
              }
            </nav>
          </div>
        </div>

        <p class="mt-4 pt-4 text-xs text-subtle">
          {{ copyright }}
        </p>
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
  /** Which pages the legal nav links, and in what order. */
  protected readonly legalSlugs = this.config.pages.footerNav;

  /**
   * "© Coffee Kontor 2025–2026" — the end of the range is always the current
   * year, so nothing has to be updated in January. Rendered on the server and
   * again on hydration; the two agree except for the one second a year in which
   * they don't.
   */
  protected readonly copyright = this.buildCopyright();

  private buildCopyright(): string {
    const start = this.branding.startYear;
    const now = new Date().getFullYear();
    const years = now > start ? `${start}–${now}` : `${start}`;
    return this.text.footer.copyright
      .replace('{name}', this.branding.name)
      .replace('{years}', years);
  }
}
