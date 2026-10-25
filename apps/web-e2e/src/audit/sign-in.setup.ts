import { expect, test } from '@playwright/test';
import { localtestEnv } from '../support/localtest';
import { fixtureSeed } from '../support/seed-fixture';
import { CUSTOMER_EMAIL, ROLES, stateFile } from './routes';

const env = localtestEnv();
const admin = { email: env['ADMIN_EMAIL'], password: env['ADMIN_PASSWORD'] };
const ACCOUNTS = {
  admin: { ...admin, editMode: '0' },
  editor: { ...admin, editMode: '1' },
  customer: {
    email: CUSTOMER_EMAIL,
    password: fixtureSeed.accounts.password,
    editMode: '0',
  },
};

/*
 * Signs in once per role and keeps the session, so each audited page opens
 * already signed in instead of passing through the login form. The editor is
 * an admin with edit mode switched on.
 */
for (const role of ROLES) {
  const { email, password, editMode } = ACCOUNTS[role];

  test(`sign in as ${role}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page
      .getByRole('textbox', { name: 'Password', exact: true })
      .fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.evaluate(
      `localStorage.setItem('admin-edit-mode', '${editMode}')`,
    );
    await page.context().storageState({ path: stateFile(role) });
  });
}
