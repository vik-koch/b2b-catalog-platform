import {
  Component,
  ElementRef,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { AuthService } from '../auth/auth.service';
import { landingFor } from '../auth/auth.guard';
import { UserIcon } from '../ui/icons/user-icon';

/**
 * The person icon in the main navbar — one control for every role.
 *
 * Signed out (and before /auth/me has answered, which is what the server also
 * renders) it is a plain link to the login page; signed in it opens a menu
 * with the one destination that role has. Same icon, same login, same session.
 */
@Component({
  selector: 'app-account-menu',
  imports: [RouterLink, UserIcon],
  host: { class: 'relative' },
  template: `
    @if (auth.user(); as user) {
      <button
        type="button"
        class="rounded-md p-2 text-stone-600 hover:bg-stone-100"
        aria-haspopup="menu"
        aria-controls="account-menu"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="text.accountMenu"
        (click)="open.set(!open())"
      >
        <app-icon-user class="h-5 w-5" />
      </button>

      @if (open()) {
        <div
          id="account-menu"
          role="menu"
          class="absolute right-0 top-full z-20 mt-1 w-56 rounded-md border border-stone-200 bg-surface py-1 text-sm shadow-lg"
        >
          <p
            class="truncate border-b border-stone-100 px-4 py-2 text-xs text-stone-500"
          >
            {{ user.email }}
          </p>
          <a
            role="menuitem"
            [routerLink]="landingFor(user.role)"
            class="block px-4 py-2 text-ink hover:bg-stone-100"
            (click)="open.set(false)"
          >
            {{ user.role === 'user' ? text.account : text.adminPanel }}
          </a>
          <button
            role="menuitem"
            type="button"
            class="block w-full px-4 py-2 text-left text-ink hover:bg-stone-100"
            (click)="logout()"
          >
            {{ text.logout }}
          </button>
        </div>
      }
    } @else {
      <a
        routerLink="/login"
        class="block rounded-md p-2 text-stone-600 hover:bg-stone-100"
        [attr.aria-label]="text.login"
      >
        <app-icon-user class="h-5 w-5" />
      </a>
    }
  `,
})
export class AccountMenu {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly router = inject(Router);

  protected readonly auth = inject(AuthService);
  protected readonly text = inject(APP_TEXT).auth;
  protected readonly open = signal(false);
  protected readonly landingFor = landingFor;

  // Neither listener ever fires on the server.
  @HostListener('document:click', ['$event.target'])
  protected onDocumentClick(target: EventTarget | null): void {
    if (target instanceof Node && !this.host.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }

  protected async logout(): Promise<void> {
    this.open.set(false);
    await this.auth.logout();
    // Leave whatever gated page we were on; the guards would bounce us anyway.
    await this.router.navigateByUrl('/');
  }
}
