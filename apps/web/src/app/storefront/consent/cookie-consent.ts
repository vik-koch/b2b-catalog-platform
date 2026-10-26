import { afterNextRender, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '../../shared/ui/button';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { fillText } from '@b2b-catalog-platform/shared';
import { DEPLOYMENT_CONFIG } from '../../shared/config/deployment-config';
import { ConsentService } from './consent.service';
import { Link } from '../../shared/ui/link';

/**
 * Cookie-consent banner. Rendered only when the deployment enables consent AND
 * no choice is recorded yet.
 *
 * Non-blocking by design: an elevated card near the bottom, not a modal.
 *
 * Gated on `ready` (set in afterNextRender) so it appears only after
 * hydration: the server renders nothing (no localStorage there), and matching
 * that on the client's first paint avoids a hydration mismatch.
 */
@Component({
  selector: 'app-cookie-consent',
  imports: [RouterLink, Button, Link],
  template: `
    @if (ready() && consent.needsDecision()) {
      <aside
        [attr.aria-label]="a11y.consentBanner"
        class="fixed inset-x-4 bottom-[calc(4.25rem+1px+env(safe-area-inset-bottom))] z-20 sm:bottom-4 mx-auto max-w-3xl rounded-xl border border-edge bg-surface shadow-xl"
      >
        <div
          class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-subtle">
            {{ message }}
            <a appLink routerLink="/privacy">{{ text.policyLink }}</a
            >{{ text.policyLinkAfter }}
          </p>
          <div class="flex shrink-0 gap-3">
            <button appButton variant="secondary" (click)="consent.reject()">
              {{ text.reject }}
            </button>
            <button appButton variant="secondary" (click)="consent.accept()">
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
  protected readonly text = inject(STOREFRONT_TEXT).consent;
  protected readonly a11y = inject(STOREFRONT_TEXT).a11y;
  protected readonly message = fillText(this.text.message, {
    provider: inject(DEPLOYMENT_CONFIG).mapProvider,
  });
  protected readonly ready = signal(false);

  constructor() {
    afterNextRender(() => this.ready.set(true));
  }
}
