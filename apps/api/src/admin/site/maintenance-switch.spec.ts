import { storeHolding } from '../../platform/settings/settings-store.fixture';
import { MaintenanceSwitch } from './maintenance-switch';

const ACTOR = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'admin@example.com',
};

describe('MaintenanceSwitch', () => {
  it('turns it on and records the change', async () => {
    const { store, recorded } = storeHolding();

    const state = await new MaintenanceSwitch(store).set(true, ACTOR);

    expect(state).toEqual({ enabled: true });
    expect(recorded).toEqual([
      { kind: 'maintenance', area: null, enabled: true },
    ]);
  });

  it('records nothing when it was already that way', async () => {
    // The panel re-sending the state it is showing is not an event.
    const { store, recorded } = storeHolding({ maintenanceMode: true });

    await new MaintenanceSwitch(store).set(true, ACTOR);

    expect(recorded).toEqual([]);
  });
});
