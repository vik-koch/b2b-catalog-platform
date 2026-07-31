import { Component, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterOutlet } from '@angular/router';
import { DEPLOYMENT_CONFIG } from './config/deployment-config';
import { CookieConsent } from './consent/cookie-consent';
import { ForcePasswordChange } from './auth/force-password-change';
import { Footer } from './layout/footer';
import { Header } from './layout/header';
import { EditModeToggle } from './admin/edit-mode-toggle';

@Component({
  imports: [
    RouterOutlet,
    Header,
    Footer,
    CookieConsent,
    ForcePasswordChange,
    EditModeToggle,
  ],
  selector: 'app-root',
  template: `
    <div class="flex min-h-dvh flex-col bg-surface text-ink">
      <app-header />
      <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
        <router-outlet />
      </main>
      <app-footer />
    </div>
    <app-cookie-consent />
    <!-- Renders nothing unless a signed-in account still owes a password
         change, so public pages carry only the (empty) component instance. -->
    <app-force-password-change />
    <!-- Admin-only storefront edit-mode toggle; empty for everyone else. -->
    <app-edit-mode-toggle />
  `,
  host: {
    '[style.--color-primary]': 'branding.theme.primary',
    '[style.--color-secondary]': 'branding.theme.secondary',
    '[style.--color-accent]': 'branding.theme.accent',
    '[style.--color-surface]': 'branding.theme.surface || null',
    '[style.--color-ink]': 'branding.theme.ink || null',
    '[style.--color-muted]': 'branding.theme.muted || null',
    '[style.--color-subtle]': 'branding.theme.subtle || null',
    '[style.--color-border]': 'branding.theme.border || null',
    '[style.--color-border-strong]': 'branding.theme.borderStrong || null',
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
