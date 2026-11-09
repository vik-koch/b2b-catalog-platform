import { Component, inject } from '@angular/core';

import { PageTitle } from '@b2b-catalog-platform/ui/content/page-title';

import { usePageSeo } from '../../../platform/page-seo';
import { STOREFRONT_ACCOUNTS_TEXT } from '../accounts-text';
import { ChangePasswordForm } from './change-password-form';

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
