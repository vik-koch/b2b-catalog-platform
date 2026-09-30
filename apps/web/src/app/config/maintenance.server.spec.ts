import { describe, expect, it } from 'vitest';
import { isGatedPath, isStaffPreview } from './maintenance.server';

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

  // The shop is closed to customers too: their account pages go with it, and
  // only the staff hint lets a cold load through (see isStaffPreview).
  it('gates a customer’s own pages', () => {
    for (const path of [
      '/account',
      '/account/orders',
      '/account/addresses/new',
      '/change-password',
      '/register',
      '/cart',
      '/checkout',
    ]) {
      expect(isGatedPath(path), path).toBe(true);
    }
  });

  it('leaves the staff way in ungated', () => {
    for (const path of [
      '/login',
      '/forgot-password',
      '/set-password',
      '/admin',
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

/**
 * Who the SSR gate waves past. The hint is a rendering signal, not an
 * authorization one — the point of these cases is that only the exact staff
 * values count, so a customer's cookie never turns the storefront back on.
 */
describe('isStaffPreview', () => {
  it('recognises staff among other cookies', () => {
    expect(isStaffPreview('cart=x; session_role=admin; consent=all')).toBe(
      true,
    );
    expect(isStaffPreview('session_role=manager')).toBe(true);
  });

  it('gates everyone else', () => {
    for (const cookies of [
      undefined,
      '',
      'session_role=user',
      'session_role=',
      'last_session_role=admin',
    ]) {
      expect(isStaffPreview(cookies), String(cookies)).toBe(false);
    }
  });
});
