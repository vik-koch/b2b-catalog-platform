import { storeHolding } from '../platform/settings/settings-store.fixture';
import { OwnershipSwitch } from './ownership-switch';

const ACTOR = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
};

describe('OwnershipSwitch', () => {
  it('hands an area over and records it', async () => {
    const { store, recorded } = storeHolding();

    const state = await new OwnershipSwitch(store).set(
      ['catalog'],
      true,
      ACTOR,
    );

    expect(state).toEqual({ ownedAreas: ['catalog'] });
    expect(recorded).toEqual([
      { kind: 'ownership', area: 'catalog', enabled: true },
    ]);
  });

  it('takes it back', async () => {
    const { store } = storeHolding({ externallyOwnedAreas: ['catalog'] });

    const state = await new OwnershipSwitch(store).set(
      ['catalog'],
      false,
      ACTOR,
    );

    expect(state).toEqual({ ownedAreas: [] });
  });

  it('records nothing when the switch was already that way', async () => {
    // The panel re-sending the state it is showing is not an event, and a
    // trail full of non-events is one nobody reads.
    const { store, recorded } = storeHolding({
      externallyOwnedAreas: ['catalog'],
    });

    await new OwnershipSwitch(store).set(['catalog'], true, ACTOR);

    expect(recorded).toEqual([]);
  });

  it('moves every area named, and records only the ones that moved', async () => {
    // The master switch: one request over all of them, and the area that was
    // already owned is not an event just because it was named again.
    const { store, recorded } = storeHolding({
      externallyOwnedAreas: ['catalog'],
    });

    const state = await new OwnershipSwitch(store).set(
      ['catalog', 'customers'],
      true,
      ACTOR,
    );

    expect(state).toEqual({ ownedAreas: ['catalog', 'customers'] });
    expect(recorded).toEqual([
      { kind: 'ownership', area: 'customers', enabled: true },
    ]);
  });
});
