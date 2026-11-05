import { readFileSync } from 'node:fs';
import { sharedTextSchema } from './shared-text';

const fixture = JSON.parse(
  readFileSync('deployments/fixture/config/texts/shared.json', 'utf8'),
);

describe('sharedTextSchema', () => {
  it('accepts the shipped demo text', () => {
    expect(sharedTextSchema.safeParse(fixture).success).toBe(true);
  });

  // A page or a mail may link any page, and a link needs its name.
  it('refuses a page without a name in nav', () => {
    const { about: _, ...nav } = fixture.nav;
    const result = sharedTextSchema.safeParse({ ...fixture, nav });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(['nav', 'about']);
  });
});
