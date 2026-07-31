import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { adminUser, plainUser } from '../auth/auth-user.fixture';
import { ADMIN_TEXT_LOADED } from '../config/admin-text';
import { EditModeService } from './edit-mode.service';

/**
 * Guarantees the security-adjacent contract of edit mode: it is *never* enabled
 * for a non-admin, regardless of the stored flag, and the toggle persists to
 * localStorage. The server enforces every write too — this only governs whether
 * the affordances are shown.
 *
 * Edit mode also waits on the admin text, which is fetched rather than injected
 * into the document, so the affordances never render with blank labels.
 *
 * That wait is injected (ADMIN_TEXT_LOADED) rather than read from the module,
 * which is what each case sets here. The flag it stands for is a module-level
 * signal — a per-tab cache the route guard reads outside any injector — and a
 * runner that shares a module graph between spec files shares that state too:
 * static-page.spec loads the text in a `beforeAll`, so before this was injected,
 * whether the "still loading" case saw it loaded came down to which file the
 * runner scheduled first.
 */
function setup(user: AuthUser | null, stored?: string, textLoaded = true) {
  localStorage.clear();
  if (stored !== undefined) localStorage.setItem('admin-edit-mode', stored);
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_ID, useValue: 'browser' },
      { provide: AuthService, useValue: { user: signal(user) } },
      { provide: ADMIN_TEXT_LOADED, useValue: signal(textLoaded) },
    ],
  });
  return TestBed.inject(EditModeService);
}

describe('EditModeService', () => {
  afterEach(() => localStorage.clear());

  it('stays disabled while the admin text is still loading', () => {
    const svc = setup(adminUser, '1', false);

    expect(svc.isAdmin()).toBe(true);
    expect(svc.enabled()).toBe(false);
  });

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
