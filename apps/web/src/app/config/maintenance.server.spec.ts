import { describe, expect, it } from 'vitest';
import { isGatedPath } from './maintenance.server';

/**
 * Which paths maintenance mode hides. The gate is fail-safe by default — an
 * unlisted path is storefront content and gets the 503 screen — so the cases
 * that matter are the ungated ones, and above all the admin *sub*-routes: they
 * are the panel the admin uses to populate the site while the gate is on.
 */
describe('isGatedPath', () => {
  it('gates storefront content', () => {
    for (const path of [
      '/',
      '/catalog',
      '/catalog/tools',
      '/product/hammer',
      '/contact',
      '/inquiry',
      '/licenses',
      '/privacy',
    ]) {
      expect(isGatedPath(path), path).toBe(true);
    }
  });

  it('leaves the session-scoped roots ungated', () => {
    for (const path of [
      '/login',
      '/admin',
      '/account',
      '/change-password',
      '/maintenance',
    ]) {
      expect(isGatedPath(path), path).toBe(false);
    }
  });

  it('leaves admin sub-routes ungated, so a cold load reaches the editor', () => {
    for (const path of [
      '/admin/products',
      '/admin/products/new',
      '/admin/products/hammer/edit',
      '/admin/categories',
      '/admin/categories/tools/edit',
      '/admin/pages/privacy/edit',
      '/admin/sync',
    ]) {
      expect(isGatedPath(path), path).toBe(false);
    }
  });

  it('ignores a trailing slash, but keeps the root gated', () => {
    expect(isGatedPath('/admin/')).toBe(false);
    expect(isGatedPath('/admin/sync/')).toBe(false);
    expect(isGatedPath('/catalog/')).toBe(true);
    expect(isGatedPath('/')).toBe(true);
  });

  it('gates a public path that merely starts with an ungated root', () => {
    expect(isGatedPath('/logins')).toBe(true);
    expect(isGatedPath('/administration')).toBe(true);
    expect(isGatedPath('/accounts-payable')).toBe(true);
  });
});
