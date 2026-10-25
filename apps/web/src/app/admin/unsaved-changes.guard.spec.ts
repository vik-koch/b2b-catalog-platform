import { COMMON_TEXT } from '../shared/config/common-text';
import { defaultCommonText } from '../shared/config/common-text.fixture';
import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { ADMIN_TEXT } from '../shared/config/admin-text';
import { defaultAdminText } from '../shared/config/admin-text.fixture';
import { ConfirmService } from '../shared/ui/confirm.service';
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
        { provide: COMMON_TEXT, useValue: defaultCommonText },
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
    const guard = unsavedChangesGuard((t) => t.products.editor.discardConfirm);

    expect(await run(guard, { hasUnsavedChanges: () => false })).toBe(true);
    expect(asked).toBeUndefined();
  });

  it('asks with the wording the caller picked', async () => {
    const guard = unsavedChangesGuard((t) => t.products.editor.discardConfirm);

    expect(await run(guard, { hasUnsavedChanges: () => true })).toBe(true);
    expect(asked?.message).toBe(
      defaultAdminText.products.editor.discardConfirm,
    );
  });

  it('asks each editor its own question', async () => {
    const guard = unsavedChangesGuard((t) => t.users.editor.discardConfirm);

    await run(guard, { hasUnsavedChanges: () => true });

    expect(asked?.message).toBe(defaultAdminText.users.editor.discardConfirm);
  });
});
