import { readSessionHint } from './session-hint';

/**
 * The readable companion to the httpOnly session cookie. It decides what the
 * navbar draws before `/auth/me` answers, so what it refuses matters as much
 * as what it accepts: anyone can type a value into it.
 */
describe('readSessionHint', () => {
  it('reads the role out of a jar of other cookies', () => {
    expect(readSessionHint('cart=x; session_role=admin; consent=all')).toBe(
      'admin',
    );
  });

  it('is nobody where there is no hint at all', () => {
    expect(readSessionHint(undefined)).toBeNull();
    expect(readSessionHint('')).toBeNull();
    expect(readSessionHint('cart=x')).toBeNull();
  });

  it('is nobody for an empty or invented value', () => {
    expect(readSessionHint('session_role=')).toBeNull();
    expect(readSessionHint('session_role=root')).toBeNull();
  });

  // A cookie whose name merely ends in the hint's name is a different cookie.
  it('does not match a cookie that only looks like it', () => {
    expect(readSessionHint('last_session_role=admin')).toBeNull();
  });
});
