import { Component, inject } from '@angular/core';
import { APP_TEXT } from '../config/app-text';
import { ChangePasswordForm } from './change-password-form';

/**
 * Home for the change-password form, reachable by every signed-in role.
 */
@Component({
  selector: 'app-change-password-page',
  imports: [ChangePasswordForm],
  template: `
    <div class="max-w-xl">
      <h1 class="mb-6 text-3xl font-medium tracking-tight">
        {{ text.heading }}
      </h1>
      <app-change-password-form />
    </div>
  `,
})
export class ChangePasswordPage {
  protected readonly text = inject(APP_TEXT).auth.changePassword;
}
