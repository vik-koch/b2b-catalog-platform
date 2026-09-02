import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { ConsentService } from '../consent/consent.service';
import { Button } from '../ui/button';
import { ScrollToTop } from './scroll-to-top';

@Component({
  imports: [RouterLink, RouterLinkActive, Button, ScrollToTop],
  selector: 'app-footer',
  template: `
    <footer
      class="bg-stone-100"
      [class.border-t]="!seamless()"
      [class.border-border]="!seamless()"
    >
      <div class="mx-auto w-full max-w-[82rem] px-4 py-4 sm:py-6 text-sm">
        <!-- One row from "sm", a column below it — and in the column the
             copyright comes last, where a copyright line belongs and where it
             is not standing between a reader and the links they came down here
             for. -->
        <div
          class="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <!-- On a phone the way back to the top rides the copyright line,
               which is the last thing on the page and the one row down here
               with space to spare. It is only ever in the document once: the
               shape that does not apply is display:none, so a screen reader
               is never offered two of them. -->
          <div class="flex items-center justify-between gap-4">
            <p class="text-xs text-subtle">{{ copyright }}</p>
            <span class="sm:hidden"><app-scroll-to-top /></span>
          </div>
          <!-- The call to action sits on the same line as the legal links, but
               outside the <nav>: it is not a legal link, and a nav of three
               quiet links plus one filled button reads as one row either way.
               It closes the row on the right, where the eye lands last. -->
          <div
            class="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-4"
          >
            <!-- Stacked on a phone: four quiet links wrapped across two lines
                 are a paragraph, and these are the ones a reader scans for by
                 name. No disclosure over them — a legal link behind a toggle
                 is one that is not readily reachable, and folding away four
                 lines is not worth that. -->
            <nav
              class="flex flex-col gap-2 text-subtle sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4"
              [attr.aria-label]="text.a11y.legalNav"
            >
              @for (slug of legalSlugs; track slug) {
                <a
                  [routerLink]="'/' + slug"
                  routerLinkActive
                  ariaCurrentWhenActive="page"
                  [attr.data-label]="text.nav[slug]"
                  class="text-stable transition-colors sm:text-center hover:text-accent active:text-primary-deep aria-[current=page]:font-medium aria-[current=page]:text-primary"
                >
                  {{ text.nav[slug] }}
                </a>
              }
              <!-- Consent withdrawal must be as easy as giving it; shown only
                   when the deployment runs the consent banner at all. -->
              @if (consent.enabled) {
                <button
                  type="button"
                  class="cursor-pointer text-left transition-colors hover:text-accent active:text-primary-deep"
                  (click)="consent.withdraw()"
                >
                  {{ text.consent.settings }}
                </button>
              }
            </nav>
            <div class="flex items-center gap-4">
              <a appButton routerLink="/inquiry">{{ text.nav['inquiry'] }}</a>
              <span class="hidden sm:block"><app-scroll-to-top /></span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  `,
})
export class Footer {
  /**
   * Drops the top border, for the pages whose own background is already the
   * footer's stone (the signed-out screens). Set by the shell, which is the
   * only thing that knows which those are.
   */
  readonly seamless = input(false);

  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(APP_TEXT);
  protected readonly consent = inject(ConsentService);
  protected readonly branding = this.config.branding;
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
