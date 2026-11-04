import { SHARED_TEXT } from '../../platform/config/shared-text';
import { defaultSharedText } from '../../platform/config/shared-text.fixture';
import {
  EnvironmentInjector,
  inject,
  runInInjectionContext,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ADMIN_TEXT } from '../../platform/config/admin-text';
import { defaultAdminText } from '../../platform/config/admin-text.fixture';
import { ConfirmService } from '@b2b-catalog-platform/ui/overlay/confirm.service';
import {
  unsavedChangesGuard,
  UnsavedChangesAware,
} from './unsaved-changes.guard';

const snapshot = {} as ActivatedRouteSnapshot;
const state = {} as RouterStateSnapshot;

async function run(
  guard: ReturnType<typeof unsavedChangesGuard>,
  component: UnsavedChangesAware,
): Promise<unknown> {
  return runInInjectionContext(TestBed.inject(EnvironmentInjector), () =>
    guard(component, snapshot, state, state),
  );
}

describe('unsavedChangesGuard', () => {
  let asked: { message: string } | undefined;

  beforeEach(() => {
    asked = undefined;
    TestBed.configureTestingModule({
      providers: [
        { provide: ADMIN_TEXT, useValue: defaultAdminText },
        { provide: SHARED_TEXT, useValue: defaultSharedText },
        {
          provide: ConfirmService,
          useValue: {
            ask: (request: { message: string }) => {
              asked = request;
              return Promise.resolve(true);
            },
          },
        },
      ],
    });
  });

  it('lets a clean editor leave without asking', async () => {
    const guard = unsavedChangesGuard(
      () => inject(ADMIN_TEXT).products.editor.discardConfirm,
    );

    expect(await run(guard, { hasUnsavedChanges: () => false })).toBe(true);
    expect(asked).toBeUndefined();
  });

  it('asks with the wording the caller picked', async () => {
    const guard = unsavedChangesGuard(
      () => inject(ADMIN_TEXT).products.editor.discardConfirm,
    );

    expect(await run(guard, { hasUnsavedChanges: () => true })).toBe(true);
    expect(asked?.message).toBe(
      defaultAdminText.products.editor.discardConfirm,
    );
  });

  it('asks each editor its own question', async () => {
    const guard = unsavedChangesGuard(
      () => inject(ADMIN_TEXT).users.editor.discardConfirm,
    );

    await run(guard, { hasUnsavedChanges: () => true });

    expect(asked?.message).toBe(defaultAdminText.users.editor.discardConfirm);
  });
});
