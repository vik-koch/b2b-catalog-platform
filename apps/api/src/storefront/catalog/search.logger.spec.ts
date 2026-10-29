import type { MockInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import { SearchLogger } from './search.logger';

/**
 * The line's shape is the contract, as it is for `AuditLogger`: the provisioned
 * Grafana dashboard reads `q=`, `results=` and `ms=` off it by regex, so a
 * change here is a change to every panel.
 */
describe('SearchLogger', () => {
  let lines: string[];
  let spy: MockInstance;

  beforeEach(() => {
    lines = [];
    spy = vi
      .spyOn(Logger.prototype, 'log')
      .mockImplementation((message: unknown) => {
        lines.push(String(message));
      });
  });

  afterEach(() => spy.mockRestore());

  it('records the query, its size, the hit count and the latency', () => {
    new SearchLogger().record({
      query: 'hafen espresso',
      terms: 2,
      results: 7,
      page: 1,
      durationMs: 12,
    });

    expect(lines).toEqual([
      'q="hafen espresso" terms=2 results=7 page=1 ms=12',
    ]);
  });

  it('quotes the query so a space cannot break the key=value tail', () => {
    new SearchLogger().record({
      query: 'cups glassware',
      terms: 2,
      results: 0,
      page: 1,
      durationMs: 3,
    });

    expect(lines[0].startsWith('q="cups glassware" ')).toBe(true);
  });

  it('keeps zero-result searches distinguishable from any other count', () => {
    new SearchLogger().record({
      query: 'teapot',
      terms: 1,
      results: 0,
      page: 1,
      durationMs: 4,
    });

    expect(lines[0]).toContain('results=0 ');
  });
});
