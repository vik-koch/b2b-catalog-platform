import { Component, inject, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { STOREFRONT_TEXT } from '../../platform/config/storefront-text';
import { SHARED_TEXT } from '../../platform/config/shared-text';
import { DEPLOYMENT_CONFIG } from '../../platform/config/deployment-config';
import {
  type ElsewhereLink,
  fillText,
} from '@b2b-catalog-platform/shared/platform';
import { ConsentService } from '../site/cookie-consent/consent.service';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { mailHref, telHref } from './contact-info';
import { PAGE_LINK } from '../platform/nav-action';
import { ScrollToTop } from './scroll-to-top';

@Component({
  imports: [RouterLink, RouterLinkActive, Button, ScrollToTop],
  selector: 'app-footer',
  template: `
    <footer
      class="bg-surface"
      [class.border-t]="!seamless()"
      [class.border-edge]="!seamless()"
    >
      <div class="mx-auto w-full max-w-328 p-4 sm:py-6 text-sm">
        <!-- A column below "sm", the copyright last. From "sm" with a seller
             line, a two-by-two grid the wrappers dissolve into (contents), the
             seller line with a floor; without one, a single row. -->
        <div
          class="flex flex-col-reverse gap-5 sm:gap-1"
          [class]="
            seller
              ? 'sm:grid sm:grid-cols-[minmax(12rem,1fr)_auto] sm:gap-x-8'
              : 'sm:flex-row sm:items-center sm:justify-between'
          "
        >
          <!-- On a phone, back-to-top rides the copyright line; only one of
               the two is ever displayed. -->
          <div
            class="flex items-center justify-between gap-4"
            [class]="seller ? 'sm:contents' : ''"
          >
            <div
              class="flex min-w-0 flex-col gap-2"
              [class]="seller ? 'sm:contents' : ''"
            >
              <!-- Who sells, then how to reach them; the no-break space keeps
                   a separator off the start of a line. -->
              @if (seller; as seller) {
                <address
                  class="text-xs not-italic text-ink-subtle
                         sm:col-start-1 sm:row-start-1 sm:self-baseline"
                >
                  <span class="whitespace-nowrap">{{ seller.name }}</span>
                  @for (number of seller.registration; track $index) {
                    <span aria-hidden="true">&nbsp;· </span>
                    <span class="whitespace-nowrap">{{ number }}</span>
                  }
                  @if (contact?.phone || contact?.email) {
                    <span class="block">
                      @if (contact.phone; as phone) {
                        <a
                          [href]="telHref(phone)"
                          class="whitespace-nowrap transition-colors
                                 hover:text-accent
                                 active:text-primary-press"
                          >{{ phone }}</a
                        >
                      }
                      @if (contact.phone && contact.email) {
                        <span aria-hidden="true">&nbsp;· </span>
                      }
                      @if (contact.email; as email) {
                        <a
                          [href]="mailHref(email)"
                          class="whitespace-nowrap transition-colors
                                 hover:text-accent
                                 active:text-primary-press"
                          >{{ email }}</a
                        >
                      }
                    </span>
                  }
                </address>
              }
              <p
                class="text-xs text-ink-subtle
                       sm:col-start-1 sm:row-start-2 sm:self-center"
              >
                {{ copyright }}
              </p>
            </div>
            <span class="sm:hidden"><app-scroll-to-top /></span>
          </div>
          <!-- The call to action, outside the legal <nav>. -->
          <div
            class="flex flex-col items-start gap-5"
            [class]="
              seller
                ? 'sm:contents'
                : 'sm:flex-row sm:flex-wrap sm:items-center sm:justify-end sm:gap-x-4'
            "
          >
            <!-- Stacked on a phone and never behind a toggle: a legal link
                 must be readily reachable. -->
            <nav
              class="flex flex-col gap-2 text-ink-subtle
                     sm:col-start-2 sm:row-start-1 sm:flex-row sm:flex-wrap
                     sm:items-center sm:justify-end sm:gap-x-4"
              [class.sm:self-baseline]="seller"
              [attr.aria-label]="text.a11y.legalNav"
            >
              @for (slug of legalSlugs; track slug) {
                <a
                  [routerLink]="'/' + slug"
                  routerLinkActive
                  ariaCurrentWhenActive="page"
                  [attr.data-label]="nav[slug]"
                  [class]="pageLink + ' sm:text-center'"
                >
                  {{ nav[slug] }}
                </a>
              }
              <!-- Withdrawing is as easy as giving. -->
              @if (consent.enabled) {
                <button
                  type="button"
                  class="cursor-pointer text-left transition-colors
                         hover:text-accent
                         active:text-primary-press"
                  (click)="consent.withdraw()"
                >
                  {{ text.consent.settings }}
                </button>
              }
            </nav>
            <div
              class="flex items-center gap-4
                     sm:col-start-2 sm:row-start-2 sm:justify-self-end"
            >
              <!-- Where else the shop exists, as marks the button's height. -->
              <div class="flex flex-wrap items-center gap-4">
                <a uiButton routerLink="/inquiry">{{ nav['inquiry'] }}</a>
                @for (link of elsewhere; track link.url) {
                  <a
                    [href]="link.url"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="flex h-9 w-auto shrink-0 items-center
                           justify-center"
                  >
                    <span class="sr-only">{{ link.label }}</span>
                    <!-- Sized from config, so nothing moves when it loads. -->
                    <span
                      aria-hidden="true"
                      class="elsewhere-mark block h-6"
                      [style.aspect-ratio]="iconRatio(link)"
                      [style.--elsewhere-icon]="iconUrl(link.icon)"
                    ></span>
                  </a>
                }
              </div>
              <span class="hidden sm:block"><app-scroll-to-top /></span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  `,
})
export class Footer {
  /** No top border, for a page already on the footer's grey. */
  readonly seamless = input(false);

  private readonly config = inject(DEPLOYMENT_CONFIG);

  protected readonly text = inject(STOREFRONT_TEXT);
  protected readonly nav = inject(SHARED_TEXT).nav;
  protected readonly consent = inject(ConsentService);
  protected readonly branding = this.config.branding;
  protected readonly legalSlugs = this.config.pages.footerNav;
  /** FR-NAV-07. */
  protected readonly elsewhere = this.config.elsewhere ?? [];
  /** NFR-LEGAL-02: its own contact, or the header's. */
  protected readonly seller = this.config.seller;
  protected readonly contact = this.seller?.contact ?? this.config.contact;
  protected readonly telHref = telHref;
  protected readonly mailHref = mailHref;
  protected readonly pageLink = PAGE_LINK;

  /** A mask's CSS url, quoted so a space in the name stays one token. */
  protected iconUrl(icon: string): string {
    return `url("/${icon}")`;
  }

  protected iconRatio(link: ElsewhereLink): string {
    return link.width && link.height ? `${link.width} / ${link.height}` : '1';
  }

  /** The range ends this year, so nothing needs updating in January. */
  protected readonly copyright = this.buildCopyright();

  private buildCopyright(): string {
    const start = this.branding.startYear;
    const now = new Date().getFullYear();
    const years = now > start ? `${start}–${now}` : `${start}`;
    return fillText(this.text.footer.copyright, {
      name: this.branding.name,
      years,
    });
  }
}
