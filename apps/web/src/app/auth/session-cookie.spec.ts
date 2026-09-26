import { AUTH_COOKIE } from '@b2b-catalog-platform/shared';
import { sessionCookieIn } from './session-cookie';

describe('sessionCookieIn', () => {
  it('picks the session cookie out, alone', () => {
    expect(sessionCookieIn(`${AUTH_COOKIE}=a-token`)).toBe(
      `${AUTH_COOKIE}=a-token`,
    );
  });

  it('finds it among others, wherever it sits, and leaves them behind', () => {
    expect(sessionCookieIn(`consent=all; ${AUTH_COOKIE}=a-token`)).toBe(
      `${AUTH_COOKIE}=a-token`,
    );
    expect(sessionCookieIn(`${AUTH_COOKIE}=a-token; consent=all`)).toBe(
      `${AUTH_COOKIE}=a-token`,
    );
  });

  it('is null for a guest', () => {
    expect(sessionCookieIn(undefined)).toBeNull();
    expect(sessionCookieIn('')).toBeNull();
    expect(sessionCookieIn('consent=all')).toBeNull();
  });

  it('is not fooled by a cookie whose name merely ends the same way', () => {
    expect(sessionCookieIn(`not-a-${AUTH_COOKIE}=a-token`)).toBeNull();
  });

  it('treats a cleared cookie as no session', () => {
    expect(sessionCookieIn(`${AUTH_COOKIE}=`)).toBeNull();
  });
});
