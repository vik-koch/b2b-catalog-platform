import { Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { AuthService } from '../auth/auth.service';
import { landingFor } from '../auth/auth.guard';
import { UserIcon } from '../ui/icons/user-icon';
import { NAV_ACTION, NAV_ACTION_LABEL } from './nav-action';

/**
 * The person icon in the main navbar — one control for every role, and a plain
 * link in every state: to the login page while signed out (which is also what
 * the server renders, before /auth/me has answered), to that role's one
 * destination once signed in. Logging out lives on the destination page
 * (SignedInAs), so this needs no menu, no open state, and no JavaScript.
 *
 * The label stays static across sign-in ("Account"), so the icon row keeps its
 * width when the session resolves; the identity itself is shown on the page.
 */
@Component({
  selector: 'app-account-link',
  imports: [RouterLink, RouterLinkActive, UserIcon],
  template: `
    <a
      [routerLink]="target()"
      routerLinkActive
      ariaCurrentWhenActive="page"
      [class]="navAction"
    >
      <app-icon-user class="h-5 w-5" />
      <span [class]="labelClass">{{ text.accountNav }}</span>
    </a>
  `,
})
export class AccountLink {
  private readonly auth = inject(AuthService);

  protected readonly text = inject(APP_TEXT).auth;
  protected readonly navAction = NAV_ACTION;
  protected readonly labelClass = NAV_ACTION_LABEL;

  protected readonly target = computed(() => {
    const user = this.auth.user();
    return user ? landingFor(user.role) : '/login';
  });
}
