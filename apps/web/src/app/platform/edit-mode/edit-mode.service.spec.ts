import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthUser } from '@b2b-catalog-platform/shared/platform';

import { adminUser, plainUser } from '../auth/auth-user.fixture';
import { AuthService } from '../auth/auth.service';
import { ADMIN_TEXT_LOADED } from '../config/admin-text';
import { EditModeService } from './edit-mode.service';

/**
 * Edit mode is never on for a non-admin, whatever the stored flag, and the
 * toggle persists to localStorage. The server checks every write; this only
 * decides whether the controls show. It also waits for the fetched admin
 * text, so no label renders blank.
 *
 * The wait is injected (ADMIN_TEXT_LOADED), not read from the module: the
 * flag is module state a shared runner graph shares across spec files, so
 * each case sets its own.
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
  // The toggle reads this: a page with nothing editable (the cart, an account
  // page, the panel) floats no control.
  it('knows whether the page has anything to edit', () => {
    const svc = setup(adminUser);

    expect(svc.hasEditables()).toBe(false);

    const release = svc.registerEditable();
    const releaseSecond = svc.registerEditable();
    expect(svc.hasEditables()).toBe(true);

    // Two surfaces on one page (a catalogue grid inside an overview) leave
    // something to edit until the last of them goes.
    release();
    expect(svc.hasEditables()).toBe(true);
    releaseSecond();
    expect(svc.hasEditables()).toBe(false);
  });
});
