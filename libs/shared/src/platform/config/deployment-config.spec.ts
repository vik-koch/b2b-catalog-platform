import { deploymentConfigSchema } from './deployment-config';

const timeZone = deploymentConfigSchema.shape.timeZone;

describe('timeZone', () => {
  // A zone is used only when a date is formatted, so a typo left to runtime
  // is a shop that boots cleanly and then refuses every order.
  it('refuses a zone name the platform does not know, at config time', () => {
    expect(timeZone.safeParse('Europe/Berlim').success).toBe(false);
  });

  it('accepts a zone name, UTC and a fixed offset, which are zones too', () => {
    for (const zone of ['Europe/Berlin', 'UTC', 'Etc/GMT+3']) {
      expect(timeZone.safeParse(zone).success).toBe(true);
    }
  });
});
