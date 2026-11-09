import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';

import { fillText } from '@b2b-catalog-platform/shared/platform';
import { Button } from '@b2b-catalog-platform/ui/actions/button';

import { AuthService } from '../../../platform/auth/auth.service';
import { SHARED_ACCOUNTS_TEXT } from '../accounts-text';

/** Who is signed in, and the way out, on /admin and /account alike. Nothing
 * until /auth/me answers, as on the server. */
@Component({
  selector: 'app-signed-in-as',
  imports: [Button],
  template: `
    @if (auth.user(); as user) {
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-lg
               bg-surface px-5 py-3"
      >
        <div>
          <p class="font-medium text-ink">{{ greeting() }}</p>
          <!-- Without a name, the greeting already is the address. -->
          @if (user.firstName) {
            <p class="text-sm text-ink-subtle">{{ user.email }}</p>
          }
        </div>
        <button uiButton variant="secondary" type="button" (click)="logout()">
          {{ text.logout }}
        </button>
      </div>
    }
  `,
})
export class SignedInAs {
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly text = inject(SHARED_ACCOUNTS_TEXT).signedInAs;

  /** By address where there is no first name, as for most staff. */
  protected readonly greeting = computed(() => {
    const user = this.auth.user();
    return fillText(this.text.greeting, {
      name: user?.firstName ?? user?.email ?? '',
    });
  });

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/');
  }
}
