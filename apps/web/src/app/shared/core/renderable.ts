/** The refusals every guarded route declares besides its own. */
type SessionRefusal = 'not-authenticated' | 'insufficient-role';

/**
 * The refusals a screen can phrase: every code a route declares but the two
 * session ones, which the guards answer with a redirect and which throw here
 * like anything unexpected.
 */
export function renderable<T extends string>(
  code: T,
): code is Exclude<T, SessionRefusal> {
  return code !== 'not-authenticated' && code !== 'insufficient-role';
}
