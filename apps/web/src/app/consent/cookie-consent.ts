import { afterNextRender, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '../ui/button';
import { APP_TEXT } from '../config/app-text';
import { ConsentService } from './consent.service';

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
  imports: [RouterLink, Button],
  template: `
    @if (ready() && consent.needsDecision()) {
      <aside
        aria-label="Cookie consent"
        class="fixed inset-x-4 bottom-4 z-20 mx-auto max-w-3xl rounded-xl border border-stone-200 bg-surface shadow-xl"
      >
        <div
          class="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-stone-600">
            {{ text.message }}
            <a routerLink="/privacy" class="text-primary hover:underline">{{
              text.policyLink
            }}</a
            >.
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
  protected readonly text = inject(APP_TEXT).consent;
  protected readonly ready = signal(false);

  constructor() {
    afterNextRender(() => this.ready.set(true));
  }
}
