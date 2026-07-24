import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '../ui/button';
import { APP_TEXT } from '../config/app-text';

// Placeholder landing page until the real storefront exists (catalog comes
// with iteration 2) — the deploy smoke check expects / to render something.
@Component({
  imports: [RouterLink, Button],
  selector: 'app-home',
  template: `
    <section class="py-12 sm:py-20">
      <p class="text-sm font-medium tracking-widest text-accent uppercase">
        {{ text.home.line1 }}
      </p>
      <h1 class="mt-3 max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
        {{ text.home.line2 }}
      </h1>
      <p class="mt-4 max-w-xl text-lg text-stone-600">
        {{ text.home.line3 }}
      </p>
      <a appButton routerLink="/about" class="mt-8">{{ text.nav['about'] }}</a>
    </section>
  `,
})
export class Home {
  protected readonly text = inject(APP_TEXT);
}
