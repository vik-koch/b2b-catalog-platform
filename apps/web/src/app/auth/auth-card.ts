import { Component } from '@angular/core';

/**
 * The white panel every signed-out screen sits in — login, register, and the
 * two password-reset steps. Pairs with the shell's stone page background on
 * those routes (see app.routes.ts `layout: 'centered'`): the card is what the
 * gray is there to set off, so the two belong to the same decision.
 *
 * Narrow-width and centering live here rather than in each page, which is the
 * whole point of having it: four screens that looked alike by coincidence now
 * look alike by construction.
 */
@Component({
  selector: 'app-auth-card',
  template: `
    <div
      class="mx-auto max-w-xl rounded-xl border border-border bg-white p-6 shadow-sm sm:p-8"
    >
      <ng-content />
    </div>
  `,
})
export class AuthCard {}
