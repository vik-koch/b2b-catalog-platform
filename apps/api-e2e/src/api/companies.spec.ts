import axios from 'axios';

/**
 * The company-suggestion proxy (FR-AUTH-09, ADR 0041). The open deployment
 * configures no sidecar, so the assertion is that it answers rather than fails
 * — the field degrading to plain typing is the documented default, not an
 * outage, and registration must be exactly as possible without a provider as
 * with one.
 */
describe('/companies/suggestions (FR-AUTH-09)', () => {
  it('answers a guest with an empty list when no sidecar is configured', async () => {
    const res = await axios.get('/companies/suggestions?q=Kontor', {
      validateStatus: () => true,
    });

    expect(res.status).toBe(200);
    expect(res.data.items).toEqual([]);
  });

  // Unauthenticated on purpose: the form that uses it is the registration
  // form, where by definition nobody has an account yet.
  it('needs no session', async () => {
    const res = await axios.get('/companies/suggestions?q=Kontor', {
      headers: { Cookie: '' },
      validateStatus: () => true,
    });

    expect(res.status).toBe(200);
  });

  it('refuses a query longer than the cap (NFR-SEC-08)', async () => {
    const res = await axios.get(`/companies/suggestions?q=${'a'.repeat(200)}`, {
      validateStatus: () => true,
    });

    expect(res.status).toBe(400);
  });
});
