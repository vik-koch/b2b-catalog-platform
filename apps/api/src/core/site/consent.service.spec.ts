import { judgeConsent } from './consent.service';

describe('judgeConsent', () => {
  it('accepts the version the text stands at', () => {
    expect(judgeConsent(3, 3)).toBe('ok');
  });

  it('refuses a form whose box was not ticked', () => {
    expect(judgeConsent(3, undefined)).toBe('consent-required');
  });

  // The text changed while the form was open: the person ticked wording that
  // is no longer the current one.
  it('refuses an older or unknown version as stale', () => {
    expect(judgeConsent(3, 2)).toBe('consent-stale');
    expect(judgeConsent(3, 4)).toBe('consent-stale');
  });

  it('fails closed where the published text has no version yet', () => {
    expect(judgeConsent(undefined, undefined)).toBe('consent-unavailable');
    expect(judgeConsent(undefined, 1)).toBe('consent-unavailable');
  });
});
