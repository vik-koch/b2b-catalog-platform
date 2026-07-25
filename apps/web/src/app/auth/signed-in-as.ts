import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { AuthService } from './auth.service';

/**
 * Who you are and what you can do with the session — shared by /admin and
 * /account. Renders nothing until /auth/me has answered, which matches the
 * server.
 *
 * This is also, for now, the account menu: the change-password link lives here
 * because there is no other place yet that belongs to the session rather than to
 * a page. Its presentation is deliberately provisional — when the account menu
 * proper is designed, the link moves and this block goes back to identity and
 * sign-out.
 */
@Component({
  selector: 'app-signed-in-as',
  imports: [Button, RouterLink],
  template: `
    @if (auth.user(); as user) {
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-100 px-4 py-3"
      >
        <p class="text-sm text-stone-600">
          {{ text.signedInAs }}
          <span class="font-medium text-ink">{{ user.email }}</span>
        </p>
        <div class="flex flex-wrap items-center gap-3">
          <a
            routerLink="/change-password"
            class="text-sm font-medium text-primary underline underline-offset-2 hover:no-underline"
          >
            {{ text.changePassword.heading }}
          </a>
          <button
            appButton
            variant="secondary"
            type="button"
            (click)="logout()"
          >
            {{ text.logout }}
          </button>
        </div>
      </div>
    }
  `,
})
export class SignedInAs {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly text = inject(APP_TEXT).auth;

  protected async logout(): Promise<void> {
    await this.auth.logout();
    // Leave the gated page we are on; the guards would bounce us anyway.
    await this.router.navigateByUrl('/');
  }
}
