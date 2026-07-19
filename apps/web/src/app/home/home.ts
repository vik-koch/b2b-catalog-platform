import { Component } from '@angular/core';

// Placeholder landing page until the real storefront exists (catalog comes
// with iteration 2) — the deploy smoke check expects / to render something.
@Component({
  selector: 'app-home',
  template: `
    <h1>Wholesale specialty coffee</h1>
    <p>Our storefront is under construction — the company pages are live.</p>
  `,
})
export class Home {}
