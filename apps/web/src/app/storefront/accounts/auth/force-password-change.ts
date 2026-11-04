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
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { Button } from '@b2b-catalog-platform/ui/actions/button';
import { DialogPanel } from '@b2b-catalog-platform/ui/overlay/dialog-panel';
import { AuthService } from '../../../platform/auth/auth.service';
import { ChangePasswordForm } from './change-password-form';
import { DialogTitle } from '@b2b-catalog-platform/ui/overlay/dialog-title';

/**
 * Forces a password change on an account still on one it was handed (the
 * bootstrap admin's comes from the deployment secrets). In the shell, so it
 * follows the account everywhere. Esc is swallowed; the way out is to log out.
 * A nudge, not a boundary: the API gates nothing on the flag.
 */
@Component({
  selector: 'app-force-password-change',
  imports: [DialogTitle, ChangePasswordForm, Button, DialogPanel],
  template: `
    <!-- Deferred: mounted on every page, and the form's code is not every
         visitor's to download. -->
    @defer (when open()) {
      @if (open()) {
        <dialog
          #dialog
          (cancel)="$event.preventDefault()"
          aria-labelledby="force-password-change-heading"
          uiDialogPanel
        >
          @if (changed()) {
            <h2 id="force-password-change-heading" uiDialogTitle class="mb-2">
              {{ text.heading }}
            </h2>
            <p class="mb-6 text-sm text-ink-subtle" role="status">
              {{ text.success }}
            </p>
            <button uiButton type="button" (click)="changed.set(false)">
              {{ text.forcedContinue }}
            </button>
          } @else {
            <h2 id="force-password-change-heading" uiDialogTitle class="mb-2">
              {{ text.forcedHeading }}
            </h2>
            <p class="mb-6 text-sm text-ink-subtle">{{ text.forcedIntro }}</p>

            <app-change-password-form
              idPrefix="forced-change-password"
              (changed)="changed.set(true)"
            />

            <button
              uiButton
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
    }
  `,
})
export class ForcePasswordChange {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly authText = inject(STOREFRONT_TEXT).auth;
  protected readonly text = this.authText.changePassword;

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  /** `user()` is null until the session resolves, so nothing flashes. */
  private readonly mustChange = computed(
    () => this.auth.user()?.mustChangePassword ?? false,
  );

  /** Holds the dialog open for the success: the flag clears with it. */
  protected readonly changed = signal(false);

  protected readonly open = computed(() => this.mustChange() || this.changed());

  constructor() {
    // The `open` attribute alone is non-modal: no focus trap, no backdrop.
    // Closing needs nothing: `open()` going false removes the element.
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
