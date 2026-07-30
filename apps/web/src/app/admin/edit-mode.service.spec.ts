import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { adminUser, plainUser } from '../auth/auth-user.fixture';
import { EditModeService } from './edit-mode.service';

/**
 * Guarantees the security-adjacent contract of edit mode: it is *never* enabled
 * for a non-admin, regardless of the stored flag, and the toggle persists to
 * localStorage. The server enforces every write too — this only governs whether
 * the affordances are shown.
 */
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

  it('is disabled by default for an admin until toggled on', () => {
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
