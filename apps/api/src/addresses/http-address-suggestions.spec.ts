import { Logger } from '@nestjs/common';
import {
  createAddressSuggestionPort,
  NoAddressSuggestions,
} from './address-suggestion.port';
import { HttpAddressSuggestions } from './http-address-suggestions';

const suggestion = {
  label: 'Hafenstraße 12, 20359 Hamburg',
  components: { postalCode: '20359', city: 'Hamburg', street: 'Hafenstraße' },
};

describe('HttpAddressSuggestions', () => {
  let fetchMock: jest.Mock;
  let warn: jest.SpyInstance;

  const answer = (body: unknown, ok = true) =>
    fetchMock.mockResolvedValue({
      ok,
      status: ok ? 200 : 502,
      json: async () => body,
    });

  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // The failure paths log; the assertions are about what they return.
    });
  });

  afterEach(() => warn.mockRestore());

  it('calls the sidecar on the contract ADR 0040 fixed', async () => {
    answer({ items: [suggestion] });

    const items = await new HttpAddressSuggestions(
      'http://address-suggest:8080',
    ).suggest('Hafenstra', 'DE', 8);

    expect(items).toEqual([suggestion]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/suggest');
    expect(url.searchParams.get('q')).toBe('Hafenstra');
    expect(url.searchParams.get('country')).toBe('DE');
    expect(url.searchParams.get('limit')).toBe('8');
  });

  // A base with a path is the likely shape behind a reverse proxy, and
  // `new URL('suggest', base)` would otherwise drop the last segment.
  it('keeps a base path intact', async () => {
    answer({ items: [] });

    await new HttpAddressSuggestions('http://sidecar/api').suggest(
      'Hafenstra',
      undefined,
      8,
    );

    expect(new URL(fetchMock.mock.calls[0][0]).pathname).toBe('/api/suggest');
    // Nothing to bias the search with, so nothing is sent.
    expect(
      new URL(fetchMock.mock.calls[0][0]).searchParams.has('country'),
    ).toBe(false);
  });

  // A provider is an accelerator, never a step: none of these may reach the
  // customer as an error, because typing the address still works.
  it.each([
    [
      'an unreachable sidecar',
      () => fetchMock.mockRejectedValue(new Error('x')),
    ],
    ['a failing sidecar', () => answer({ items: [] }, false)],
    ['an answer in the wrong shape', () => answer({ items: [{ label: 1 }] })],
    ['an answer that is not JSON at all', () => answer('nope')],
  ])('answers empty on %s', async (_name, arrange) => {
    arrange();

    const items = await new HttpAddressSuggestions('http://sidecar').suggest(
      'Hafenstra',
      'DE',
      8,
    );

    expect(items).toEqual([]);
  });

  // What a customer is typing is their address; it must not reach the log.
  it('logs a failure without the query', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await new HttpAddressSuggestions('http://sidecar').suggest(
      'Hafenstraße 12',
      'DE',
      8,
    );

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('Hafenstra');
  });
});

describe('createAddressSuggestionPort', () => {
  let log: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {
      // Asserted on below; not wanted in the test output.
    });
  });

  afterEach(() => log.mockRestore());

  it('suggests nothing without a sidecar, which is what the open deployment ships', () => {
    expect(createAddressSuggestionPort(undefined)).toBeInstanceOf(
      NoAddressSuggestions,
    );
  });

  it('calls the sidecar the environment points at', () => {
    expect(
      createAddressSuggestionPort('http://address-suggest:8080'),
    ).toBeInstanceOf(HttpAddressSuggestions);
  });

  // The one thing a silent misconfiguration would cost: a deployment that meant
  // to enable suggestions and misspelled the variable can read which way it
  // resolved out of its own boot log.
  it.each([
    [undefined, /disabled/],
    ['http://address-suggest:8080', /enabled/],
  ])('says at boot which way %s resolved', (url, expected) => {
    createAddressSuggestionPort(url);

    expect(String(log.mock.calls[0][0])).toMatch(expected);
  });
});
