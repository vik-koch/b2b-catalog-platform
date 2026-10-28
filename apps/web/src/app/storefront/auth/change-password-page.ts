import { Component, inject } from '@angular/core';
import { STOREFRONT_TEXT } from '../../shared/config/storefront-text';
import { usePageSeo } from '../../shared/core/page-seo';
import { ChangePasswordForm } from './change-password-form';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';

/**
 * Home for the change-password form, reachable by every signed-in role.
 */
@Component({
  selector: 'app-change-password-page',
  imports: [ChangePasswordForm, PageTitle],
  template: `
    <div class="max-w-xl">
      <h1 appPageTitle class="mb-4">
        {{ text.heading }}
      </h1>
      <app-change-password-form />
    </div>
  `,
})
export class ChangePasswordPage {
  protected readonly text = inject(STOREFRONT_TEXT).auth.changePassword;

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }
}
