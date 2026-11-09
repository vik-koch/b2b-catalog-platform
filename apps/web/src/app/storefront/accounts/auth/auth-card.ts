import { Component } from '@angular/core';

import { Card } from '@b2b-catalog-platform/ui/content/card';

/** The card the signed-out screens sit in, on the `centered` layout's
 * ground; the centred width belongs to that layout, so it lives here. */
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
