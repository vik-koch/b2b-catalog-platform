import { SESSION_HINT_COOKIE } from '@b2b-catalog-platform/shared';
import { readSessionHint } from './session-hint';
import { sessionShellSource } from './session-shell.server';

/** Sets the hint cookie for this document, or clears it. */
function hint(value: string | null): void {
  document.cookie =
    value === null
      ? `${SESSION_HINT_COOKIE}=; max-age=0; path=/`
      : `${SESSION_HINT_COOKIE}=${value}; path=/`;
}

/** Runs the script the server injects, and reports what it put on <html>. */
function run(): string | null {
  const root = document.documentElement;
  root.classList.remove('session-known', 'session-anonymous');
  new Function(sessionShellSource())();
  if (root.classList.contains('session-known')) return 'known';
  return root.classList.contains('session-anonymous') ? 'anonymous' : null;
}

/**
 * The script reads the same cookie `readSessionHint` does, in plain ES5,
 * because it runs before any of the app exists. These are what hold the two to
 * the same answer — a disagreement would show as the account label changing
 * the moment Angular boots, which is the flicker the script is there to
 * remove.
 */
describe('the pre-paint session script', () => {
  afterEach(() => hint(null));

  it('marks a visitor with a session', () => {
    hint('user');

    expect(run()).toBe('known');
    expect(readSessionHint(document.cookie)).toBe('user');
  });

  it('marks a visitor without one', () => {
    hint(null);

    expect(run()).toBe('anonymous');
    expect(readSessionHint(document.cookie)).toBeNull();
  });

  // The cookie is editable by hand and carries no authority; anything that is
  // not a role is nobody, in both readers.
  it('treats an invented value as nobody, exactly as the app does', () => {
    hint('superuser');

    expect(run()).toBe('anonymous');
    expect(readSessionHint(document.cookie)).toBeNull();
  });

  it('recognises every role the app does', () => {
    for (const role of ['admin', 'manager', 'user']) {
      hint(role);

      expect(run()).toBe('known');
      expect(readSessionHint(document.cookie)).toBe(role);
    }
  });
});
