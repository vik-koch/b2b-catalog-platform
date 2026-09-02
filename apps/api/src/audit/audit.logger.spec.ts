import type { MockInstance } from 'vitest';
import { Logger } from '@nestjs/common';
import { AuthUser } from '@b2b-catalog-platform/shared';
import { AuditLogger } from './audit.logger';

const actor = {
  id: 'b6f7c0f4-1111-2222-3333-444455556666',
  email: 'admin@example.com',
  role: 'admin',
} as AuthUser;

/**
 * The line's shape is the contract: Loki queries filter on the action token and
 * read the `key=value` tail, so a change here is a change to every saved query.
 */
describe('AuditLogger', () => {
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

  it('records the action, the actor and the entity', () => {
    new AuditLogger().record('product.deleted', actor, {
      id: 'p-1',
      slug: 'espresso-dolce',
      name: 'Espresso Dolce',
    });

    expect(lines).toEqual([
      'product.deleted actor=admin@example.com id=p-1 slug=espresso-dolce name="Espresso Dolce"',
    ]);
  });

  it('quotes the name so a space cannot break the key=value tail', () => {
    new AuditLogger().record('category.created', actor, {
      name: 'Cups & Glassware',
    });

    expect(lines[0]).toContain('name="Cups & Glassware"');
  });

  it('omits fields the caller does not have', () => {
    new AuditLogger().record('category.reordered', actor, {});

    expect(lines).toEqual(['category.reordered actor=admin@example.com']);
  });
});
