import { DOCUMENT_EXPIRY_WARNING_DAYS } from '../../core/catalog/documents';
import { isoToday } from '../../platform/iso-day';
import { documentExpiryState } from './documents';

/** One rule for the admin list's badge, its filter and the panel's count
 * (FR-DOC-04). The boundaries matter: a state a day early makes count and list
 * disagree. */
describe('documentExpiryState', () => {
  const today = '2026-09-05';

  it('calls a document with no expiry valid', () => {
    expect(documentExpiryState(null, today)).toBe('valid');
  });

  it('expires a document the day after the date on it', () => {
    expect(documentExpiryState('2026-09-05', today)).toBe('expiring');
    expect(documentExpiryState('2026-09-04', today)).toBe('expired');
  });

  it('warns from exactly the warning window and no sooner', () => {
    // 30 days out is the first day of the warning; 31 is still simply valid.
    expect(documentExpiryState('2026-10-05', today)).toBe('expiring');
    expect(documentExpiryState('2026-10-06', today)).toBe('valid');
  });

  it('measures the window in whole days', () => {
    expect(DOCUMENT_EXPIRY_WARNING_DAYS).toBe(30);
  });

  // Days rather than instants: parsed in the server's zone, a container in the
  // west would answer with yesterday's date for half the evening.
  it('reads today as a UTC day', () => {
    expect(isoToday(new Date('2026-09-05T23:30:00Z'))).toBe('2026-09-05');
  });
});
