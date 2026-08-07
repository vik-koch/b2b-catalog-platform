import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { AuthService } from './auth.service';

/**
 * Who you are and the way out — shared by /admin and /account, which greet the
 * account holder the same way whatever they may do once inside. Renders nothing
 * until /auth/me has answered, which matches the server.
 *
 * Identity and sign-out only: everything you can *do* with the account is a
 * section of the page below, so this block stays the same on both.
 */
@Component({
  selector: 'app-signed-in-as',
  imports: [Button],
  template: `
    @if (auth.user(); as user) {
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-stone-100 px-4 py-3"
      >
        <div>
          <p class="font-medium text-ink">{{ greeting() }}</p>
          <!-- Only when the greeting used a name; otherwise it *is* the
               address, and repeating it says nothing. -->
          @if (user.firstName) {
            <p class="text-sm text-muted">{{ user.email }}</p>
          }
        </div>
        <button appButton variant="secondary" type="button" (click)="logout()">
          {{ text.logout }}
        </button>
      </div>
    }
  `,
})
export class SignedInAs {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly text = inject(APP_TEXT).auth;

  /**
   * By first name where there is one, by address otherwise — staff accounts are
   * created by other staff and describe nobody, and the bootstrap admin is a
   * config value rather than a person.
   */
  protected readonly greeting = computed(() => {
    const user = this.auth.user();
    return this.text.greeting.replace(
      '{name}',
      user?.firstName ?? user?.email ?? '',
    );
  });

  protected async logout(): Promise<void> {
    await this.auth.logout();
    // Leave the gated page we are on; the guards would bounce us anyway.
    await this.router.navigateByUrl('/');
  }
}
