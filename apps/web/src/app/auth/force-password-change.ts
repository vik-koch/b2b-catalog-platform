import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { Button } from '../ui/button';
import { AuthService } from './auth.service';
import { ChangePasswordForm } from './change-password-form';

/**
 * Forces the change-password form on an account still using a password it was
 * handed rather than chose — in practice the bootstrap admin, whose password
 * came from the deploy pipeline's env and is therefore known to whoever can
 * read the deployment secrets.
 *
 * Lives in the app shell, not on a page, so it follows the account wherever it
 * navigates; it renders nothing for guests, which is also what the server
 * renders (SSR never resolves a session), so it costs public pages nothing.
 *
 * A native <dialog> in modal mode: the focus trap, the inert background and the
 * top-layer stacking come from the platform. Esc is deliberately swallowed —
 * dismissing would just leave the account on the shared password. The way out,
 * for someone who cannot produce the current password, is to log out.
 *
 * It is a nudge, not a security boundary: the session is fully valid and the API
 * gates nothing on the flag. Someone determined can close the dialog from the
 * console — they would be locking *themselves* out of a prompt, which is not a
 * threat model worth serving.
 */
@Component({
  selector: 'app-force-password-change',
  imports: [ChangePasswordForm, Button],
  template: `
    @if (open()) {
      <dialog
        #dialog
        (cancel)="$event.preventDefault()"
        aria-labelledby="force-password-change-heading"
        class="m-auto max-w-md rounded-xl border border-border bg-surface p-6 text-ink shadow-xl backdrop:bg-ink/50"
      >
        @if (changed()) {
          <h2
            id="force-password-change-heading"
            class="mb-2 text-xl font-bold tracking-tight"
          >
            {{ text.heading }}
          </h2>
          <p class="mb-6 text-sm text-muted" role="status">
            {{ text.success }}
          </p>
          <button appButton type="button" (click)="changed.set(false)">
            {{ text.forcedContinue }}
          </button>
        } @else {
          <h2
            id="force-password-change-heading"
            class="mb-2 text-xl font-bold tracking-tight"
          >
            {{ text.forcedHeading }}
          </h2>
          <p class="mb-6 text-sm text-muted">{{ text.forcedIntro }}</p>

          <app-change-password-form
            idPrefix="forced-change-password"
            (changed)="changed.set(true)"
          />

          <button
            appButton
            variant="secondary"
            type="button"
            class="mt-6"
            (click)="logout()"
          >
            {{ authText.logout }}
          </button>
        }
      </dialog>
    }
  `,
})
export class ForcePasswordChange {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly authText = inject(APP_TEXT).auth;
  protected readonly text = this.authText.changePassword;

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  /**
   * Reads `user()`, which folds "session not resolved yet" into "signed out" —
   * so the dialog cannot flash on a page load before /auth/me has answered.
   */
  private readonly mustChange = computed(
    () => this.auth.user()?.mustChangePassword ?? false,
  );

  /**
   * Set on success, cleared by the acknowledgement. Without it the dialog would
   * disappear the instant the flag clears (it clears from the very response that
   * confirms the change), leaving no trace that anything happened.
   */
  protected readonly changed = signal(false);

  protected readonly open = computed(() => this.mustChange() || this.changed());

  constructor() {
    // showModal() has to be called imperatively — the `open` attribute alone
    // renders a non-modal dialog, without the focus trap or the backdrop.
    // Closing needs no counterpart: `open()` going false removes the element,
    // and a removed dialog is closed by definition.
    effect(() => {
      const element = this.dialog()?.nativeElement;
      if (element && !element.open) {
        element.showModal();
      }
    });
  }

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/');
  }
}
