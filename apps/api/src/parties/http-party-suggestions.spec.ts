import type { Mock, MockInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import { HttpPartySuggestions } from './http-party-suggestions';
import {
  createPartySuggestionPort,
  NoPartySuggestions,
} from './party-suggestion.port';

const kontor = {
  name: 'Kontor GmbH',
  registrationId: 'DE123456789',
  entityType: 'legal',
  address: { postalCode: '20359', city: 'Hamburg', street: 'Hafenstraße' },
};

describe('HttpPartySuggestions', () => {
  let fetchMock: Mock;
  let warn: MockInstance;

  const answer = (body: unknown, ok = true) =>
    fetchMock.mockResolvedValue({
      ok,
      status: ok ? 200 : 502,
      json: async () => body,
    });

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // The failure paths log; the assertions are about what they return.
    });
  });

  afterEach(() => warn.mockRestore());

  it('asks the sidecar on its second path, not the address one', async () => {
    answer({ items: [kontor] });

    const items = await new HttpPartySuggestions('http://sidecar').suggest(
      'Kontor',
      8,
    );

    expect(items).toEqual([kontor]);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.pathname).toBe('/suggest-party');
    expect(url.searchParams.get('q')).toBe('Kontor');
    expect(url.searchParams.get('limit')).toBe('8');
  });

  // The whole point of the entity type: an individual's registered address is
  // their home, and the browser decides on this field whether to seed one.
  it('carries the entity type and the registered address through', async () => {
    answer({
      items: [{ name: 'Jane Doe', entityType: 'individual' }, kontor],
    });

    const items = await new HttpPartySuggestions('http://sidecar').suggest(
      'Kontor',
      8,
    );

    expect(items[0].entityType).toBe('individual');
    expect(items[0].address).toBeUndefined();
    expect(items[1].address?.city).toBe('Hamburg');
  });

  // A sidecar that predates this path answers 404. Degrading to "no company
  // suggestions" is what makes the second subject need no capability flag.
  it.each([
    ['a sidecar with no such path', () => answer({ items: [] }, false)],
    [
      'an unreachable sidecar',
      () => fetchMock.mockRejectedValue(new Error('x')),
    ],
    ['an answer in the wrong shape', () => answer({ items: [{ name: 1 }] })],
  ])('answers empty on %s', async (_name, arrange) => {
    arrange();

    const items = await new HttpPartySuggestions('http://sidecar').suggest(
      'Kontor',
      8,
    );

    expect(items).toEqual([]);
  });

  // A customer's company is who they are; it must not reach the log.
  it('logs a failure without the query', async () => {
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    await new HttpPartySuggestions('http://sidecar').suggest('Kontor', 8);

    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0][0])).not.toContain('Kontor');
  });
});

describe('createPartySuggestionPort', () => {
  let log: MockInstance;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {
      // Asserted on below; not wanted in the test output.
    });
  });

  afterEach(() => log.mockRestore());

  it('suggests nothing without a sidecar, which is what the open deployment ships', () => {
    expect(createPartySuggestionPort(undefined)).toBeInstanceOf(
      NoPartySuggestions,
    );
  });

  // One variable, two subjects: the same URL that turns addresses on turns
  // companies on.
  it('calls the sidecar the environment points at', () => {
    expect(createPartySuggestionPort('http://sidecar')).toBeInstanceOf(
      HttpPartySuggestions,
    );
  });

  it.each([
    [undefined, /disabled/],
    ['http://sidecar', /enabled/],
  ])('says at boot which way %s resolved', (url, expected) => {
    createPartySuggestionPort(url);

    expect(String(log.mock.calls[0][0])).toMatch(expected);
  });
});
