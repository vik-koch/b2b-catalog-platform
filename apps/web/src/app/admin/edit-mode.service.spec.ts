import { PLATFORM_ID, signal } from '@angular/core';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { adminUser, plainUser } from '../auth/auth-user.fixture';
import { defaultAdminText } from '../config/admin-text.fixture';
import { loadAdminText } from '../config/admin-text';
import { EditModeService } from './edit-mode.service';

/**
 * Guarantees the security-adjacent contract of edit mode: it is *never* enabled
 * for a non-admin, regardless of the stored flag, and the toggle persists to
 * localStorage. The server enforces every write too — this only governs whether
 * the affordances are shown.
 *
 * Edit mode also waits on the admin text, which is fetched rather than injected
 * into the document, so the affordances never render with blank labels. The
 * first test covers that; the rest load it up front, as a real admin session
 * does. The loaded text is cached per module, so order matters here.
 */
function stubAdminTextFetch() {
  vi.stubGlobal('fetch', () =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(defaultAdminText),
    }),
  );
}
function setup(user: AuthUser | null, stored?: string) {
  localStorage.clear();
  if (stored !== undefined) localStorage.setItem('admin-edit-mode', stored);
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: AuthService, useValue: { user: signal(user) } },
    ],
  });
  return TestBed.inject(EditModeService);
}

describe('EditModeService', () => {
  afterEach(() => localStorage.clear());

  it('stays disabled while the admin text is still loading', () => {
    const svc = setup(adminUser, '1');

    expect(svc.isAdmin()).toBe(true);
    expect(svc.enabled()).toBe(false);
  });

  it('is disabled by default for an admin until toggled on', async () => {
    stubAdminTextFetch();
    await loadAdminText();
    const svc = setup(adminUser);

    expect(svc.enabled()).toBe(false);
  });

  it('enables for an admin after toggling', () => {
    const svc = setup(adminUser);

    svc.toggle();

    expect(svc.enabled()).toBe(true);
    expect(localStorage.getItem('admin-edit-mode')).toBe('1');
  });

  it('restores a previously stored preference for an admin', () => {
    const svc = setup(adminUser, '1');

    expect(svc.enabled()).toBe(true);
  });

  it('never enables for a non-admin, even with the flag stored', () => {
    const svc = setup(plainUser, '1');

    expect(svc.isAdmin()).toBe(false);
    expect(svc.enabled()).toBe(false);

    // Toggling still writes the preference but cannot reveal the affordances.
    svc.toggle();
    expect(svc.enabled()).toBe(false);
  });

  it('never enables for an anonymous visitor', () => {
    const svc = setup(null, '1');

    expect(svc.enabled()).toBe(false);
  });
});
