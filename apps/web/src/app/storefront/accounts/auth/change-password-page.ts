import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts-text';
import { Component, inject } from '@angular/core';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { usePageSeo } from '../../../platform/page-seo';
import { ChangePasswordForm } from './change-password-form';
import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';

/** Reachable by every signed-in role. */
@Component({
  selector: 'app-change-password-page',
  imports: [ChangePasswordForm, PageTitle],
  template: `
    <div class="max-w-xl">
      <h1 uiPageTitle class="mb-4">
        {{ text.heading }}
      </h1>
      <app-change-password-form />
    </div>
  `,
})
export class ChangePasswordPage {
  protected readonly text = inject(STOREFRONT_ACCOUNTS_TEXT).auth
    .changePassword;

  constructor() {
    usePageSeo({ name: () => this.text.heading });
  }
}
