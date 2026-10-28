import { Component } from '@angular/core';
import { Card } from '@b2b-catalog-platform/ui/content/card';

/**
 * The card every signed-out screen sits in: login, register, and the two
 * password-reset steps. Pairs with the shell's grey ground on those routes
 * (`layout: 'centered'` in storefront.routes.ts), so the centred width lives
 * here rather than in the lib or in each page.
 */
@Component({
  selector: 'app-auth-card',
  imports: [Card],
  template: `
    <div
      uiCard
      variant="raised"
      [padded]="false"
      class="mx-auto max-w-xl p-5 sm:p-8"
    >
      <ng-content />
    </div>
  `,
})
export class AuthCard {}
