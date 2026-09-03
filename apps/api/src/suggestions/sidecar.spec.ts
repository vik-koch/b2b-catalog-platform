import type { Mock, MockInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import * as z from 'zod';
import { SuggestionSidecar } from './sidecar';

const schema = z.object({ items: z.array(z.object({ label: z.string() })) });

/**
 * The failure policy both adapters inherit, tested where it lives rather than
 * twice over through them. A provider is an accelerator, never a step: whatever
 * goes wrong out there, the customer is left typing.
 *
 * The adapters' own specs cover what each asks for and how it shapes an answer;
 * what is pinned here is that nothing reaches a caller as an exception, and
 * that a stalled sidecar is abandoned rather than waited on.
 */
describe('SuggestionSidecar', () => {
  let fetchMock: Mock;
  let warn: MockInstance;
  let sidecar: SuggestionSidecar;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {
      // Every failure path logs; the assertions are about what it returns.
    });
    sidecar = new SuggestionSidecar('http://sidecar:8080', new Logger('test'));
  });

  afterEach(() => warn.mockRestore());

  it('returns the items a good answer carries', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [{ label: 'Hafenstraße 12' }] }),
    });

    await expect(
      sidecar.get('suggest', { q: 'Hafen' }, schema),
    ).resolves.toEqual([{ label: 'Hafenstraße 12' }]);
  });

  describe('answers no items rather than throwing', () => {
    const cases: [string, () => void][] = [
      [
        'the sidecar is unreachable',
        () => fetchMock.mockRejectedValue(new Error('ECONNREFUSED')),
      ],
      // How a sidecar built before a path degrades: it is running, it simply
      // does not know this subject yet.
      [
        'it answers 404',
        () =>
          fetchMock.mockResolvedValue({
            ok: false,
            status: 404,
            json: async () => ({}),
          }),
      ],
      [
        'it answers 500',
        () =>
          fetchMock.mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({}),
          }),
      ],
      [
        'the body is not JSON',
        () =>
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => {
              throw new SyntaxError('Unexpected token <');
            },
          }),
      ],
      // A deployment's own code, so a shape it gets wrong must not reach our
      // validated response.
      [
        'the shape is wrong',
        () =>
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ items: [{ name: 'not a label' }] }),
          }),
      ],
      [
        'there is no items key at all',
        () =>
          fetchMock.mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => [{ label: 'a bare array' }],
          }),
      ],
    ];

    it.each(cases)('when %s', async (_name, arrange) => {
      arrange();

      await expect(sidecar.get('suggest', { q: 'x' }, schema)).resolves.toEqual(
        [],
      );
    });
  });

  it('gives up on a sidecar that never answers', async () => {
    // The real abort comes from `AbortSignal.timeout`; what is asserted is that
    // the signal is passed at all and that an abort lands as an empty answer —
    // waiting on a stalled provider is the one failure a customer would feel.
    fetchMock.mockImplementation((_url, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      return Promise.reject(
        new DOMException('The operation was aborted', 'TimeoutError'),
      );
    });

    await expect(sidecar.get('suggest', { q: 'x' }, schema)).resolves.toEqual(
      [],
    );
  });

  it('never logs what the customer is typing', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

    await sidecar.get('suggest', { q: 'Hafenstraße 12' }, schema);

    // Their address is who they are; a warning about our own plumbing is no
    // reason to write it down.
    for (const call of warn.mock.calls) {
      expect(String(call[0])).not.toContain('Hafenstraße');
    }
  });

  describe('the URL it builds', () => {
    const urlOf = () => new URL(fetchMock.mock.calls[0][0]);

    beforeEach(() =>
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ items: [] }),
      }),
    );

    it('keeps a base path, which `new URL` would otherwise drop', async () => {
      const nested = new SuggestionSidecar(
        'http://sidecar:8080/api',
        new Logger('test'),
      );

      await nested.get('suggest', {}, schema);

      expect(urlOf().pathname).toBe('/api/suggest');
    });

    it('leaves a base that already ends in a slash alone', async () => {
      const slashed = new SuggestionSidecar(
        'http://sidecar:8080/api/',
        new Logger('test'),
      );

      await slashed.get('suggest', {}, schema);

      expect(urlOf().pathname).toBe('/api/suggest');
    });

    it('writes the params it was given, and omits the undefined ones', async () => {
      await sidecar.get(
        'suggest',
        { q: 'Hafen', limit: 8, country: undefined },
        schema,
      );

      const url = urlOf();
      expect(url.searchParams.get('q')).toBe('Hafen');
      expect(url.searchParams.get('limit')).toBe('8');
      expect(url.searchParams.has('country')).toBe(false);
    });
  });
});
