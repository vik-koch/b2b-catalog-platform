import { afterNextRender, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { fillText } from '@b2b-catalog-platform/shared/platform';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { Link } from '@b2b-catalog-platform/ui/actions/link';

import { SITE_CONFIG } from '../../../core/site/site-config';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { STOREFRONT_SITE_TEXT } from '../site-text';
import { ConsentService } from './consent.service';

/** The cookie banner, where consent is enabled and no choice recorded: a card
 * near the bottom, never a modal. Gated on `ready` (afterNextRender), as the
 * server renders none and the first paint must match. */
@Component({
  selector: 'app-cookie-consent',
  imports: [RouterLink, Button, Link],
  template: `
    @if (ready() && consent.needsDecision()) {
      <aside
        [attr.aria-label]="a11y.consentBanner"
        class="fixed inset-x-4
               bottom-[calc(4.25rem+1px+env(safe-area-inset-bottom))] z-20
               mx-auto max-w-3xl rounded-xl border border-edge
               bg-surface-subtle shadow-xl
               sm:bottom-4"
      >
        <div
          class="flex flex-col gap-4 p-4
                 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-ink-subtle">
            {{ message }}
            <a uiLink routerLink="/privacy">{{ text.policyLink }}</a
            >{{ text.policyLinkAfter }}
          </p>
          <div class="flex shrink-0 gap-3">
            <button uiButton variant="secondary" (click)="consent.reject()">
              {{ text.reject }}
            </button>
            <button uiButton variant="secondary" (click)="consent.accept()">
              {{ text.accept }}
            </button>
          </div>
        </div>
      </aside>
    }
  `,
})
export class CookieConsent {
  protected readonly consent = inject(ConsentService);
  protected readonly text = inject(STOREFRONT_SITE_TEXT).consent;
  protected readonly a11y = inject(STOREFRONT_TEXT).a11y;
  protected readonly message = fillText(this.text.message, {
    provider: inject(SITE_CONFIG).mapProvider,
  });
  protected readonly ready = signal(false);

  constructor() {
    afterNextRender(() => this.ready.set(true));
  }
}
