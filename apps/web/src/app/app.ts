import { Component, inject } from '@angular/core';
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
})
export class App {
  constructor() {
    // Set the document title from the per-deployment config rather than the
    // baked index.html, so overriding branding needs no rebuild. Runs during
    // SSR too, so the served HTML (and crawlers) get the right title.
    const branding = inject(DEPLOYMENT_CONFIG).branding;
    inject(Title).setTitle(branding.title ?? branding.name);
  }
}
