import type { Request, Response } from 'express';
import { AUTH_COOKIE, SESSION_HINT_COOKIE } from '@b2b-catalog-platform/shared';
import { endSession, issueSession, SESSION_MAX_AGE_MS } from './session-cookie';

/** Express's cookie calls, in the order they were made. */
function recorder() {
  const set: {
    name: string;
    value: string;
    options: Record<string, unknown>;
  }[] = [];
  const cleared: { name: string; options: Record<string, unknown> }[] = [];
  const res = {
    cookie: (name: string, value: string, options: Record<string, unknown>) => {
      set.push({ name, value, options });
      return res;
    },
    clearCookie: (name: string, options: Record<string, unknown>) => {
      cleared.push({ name, options });
      return res;
    },
  } as unknown as Response;
  return { res, set, cleared };
}

const secureRequest = { secure: true } as Request;

/**
 * The hint only works because it cannot drift from the cookie it mirrors: both
 * are written by one call and cleared by one call, with attributes that match.
 */
describe('session cookies', () => {
  it('issues the token and the readable hint together', () => {
    const { res, set } = recorder();

    issueSession(secureRequest, res, 'jwt-value', 'manager');

    expect(set).toHaveLength(2);
    const [session, hint] = set;
    expect(session).toMatchObject({
      name: AUTH_COOKIE,
      value: 'jwt-value',
      options: { httpOnly: true, maxAge: SESSION_MAX_AGE_MS },
    });
    // Readable — that is the whole point of it — and nothing but the role.
    expect(hint).toMatchObject({
      name: SESSION_HINT_COOKIE,
      value: 'manager',
      options: { httpOnly: false, maxAge: SESSION_MAX_AGE_MS },
    });
  });

  it('gives both cookies the same delivery attributes', () => {
    const { res, set } = recorder();

    issueSession(secureRequest, res, 'jwt-value', 'user');

    const [session, hint] = set;
    for (const key of ['secure', 'sameSite', 'path', 'maxAge']) {
      expect(hint.options[key]).toEqual(session.options[key]);
    }
  });

  // A browser only drops a cookie whose attributes match the ones that set it,
  // so a hint cleared with the wrong attributes would outlive its session.
  it('clears both, with the attributes that set them', () => {
    const { res, cleared } = recorder();

    endSession(secureRequest, res);

    expect(cleared.map((c) => c.name)).toEqual([
      AUTH_COOKIE,
      SESSION_HINT_COOKIE,
    ]);
    expect(cleared[0].options).toMatchObject({ httpOnly: true, path: '/' });
    expect(cleared[1].options).toMatchObject({ httpOnly: false, path: '/' });
    expect(cleared.every((c) => c.options.maxAge === undefined)).toBe(true);
  });
});
