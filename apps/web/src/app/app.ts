import { Component, DOCUMENT, inject, Renderer2 } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { DEPLOYMENT_CONFIG } from './config/deployment-config';
import { CookieConsent } from './consent/cookie-consent';
import { Footer } from './layout/footer';
import { Header } from './layout/header';

@Component({
  imports: [RouterOutlet, Header, Footer, CookieConsent],
  selector: 'app-root',
  template: `
    <div class="flex min-h-dvh flex-col bg-surface text-ink">
      <app-header />
      <main class="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <router-outlet />
      </main>
      <app-footer />
    </div>
    <app-cookie-consent />
  `,
  host: {
    '[style.--color-primary]': 'branding.theme.primary',
    '[style.--color-secondary]': 'branding.theme.secondary',
    '[style.--color-accent]': 'branding.theme.accent',
    '[style.--color-surface]': 'branding.theme.surface || null',
    '[style.--color-ink]': 'branding.theme.ink || null',
  },
})
export class App {
  protected branding = inject(DEPLOYMENT_CONFIG).branding;
  constructor() {
    // Set the document title from the per-deployment config rather than the
    // baked index.html, so overriding branding needs no rebuild. Runs during
    // SSR too, so the served HTML (and crawlers) get the right title.
    inject(Title).setTitle(this.branding.title);
  }
}
