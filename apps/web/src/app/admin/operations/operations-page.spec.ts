import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppSettings, SettingChange } from '@b2b-catalog-platform/shared';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { DeploymentConfig } from '../../config/deployment-config.type';
import { ConfirmService } from '../../ui/confirm.service';
import { SettingsService } from '../settings/settings.service';
import { OperationsPage } from './operations-page';

const text = defaultAdminText.operations;
const ownershipText = defaultAdminText.ownership;
const maintenanceText = defaultAdminText.maintenance;

const config = {
  branding: { title: 'Test Shop' },
  catalog: { currency: { code: 'EUR', locale: 'de-DE' } },
} as unknown as DeploymentConfig;

const change = (over: Partial<SettingChange> = {}): SettingChange => ({
  id: '00000000-0000-0000-0000-0000000000c1',
  kind: 'ownership',
  area: 'catalog',
  enabled: true,
  changedAt: '2026-09-10T10:00:00.000Z',
  actorEmail: 'admin@example.com',
  ...over,
});

interface Harness {
  read: ReturnType<typeof vi.fn>;
  setOwnership: ReturnType<typeof vi.fn>;
  setMaintenance: ReturnType<typeof vi.fn>;
  listChanges: ReturnType<typeof vi.fn>;
  confirm: ReturnType<typeof vi.fn>;
}

async function render(
  options: {
    owned?: boolean;
    maintenanceOn?: boolean;
    changes?: SettingChange[];
    confirmed?: boolean;
    /** A read left hanging, for the spec that asserts the page waits. */
    read?: Promise<AppSettings>;
  } = {},
) {
  const settings: AppSettings = {
    maintenanceEnabled: options.maintenanceOn ?? false,
    ownedAreas: options.owned ? ['catalog'] : [],
    updatedAt: '2026-09-10T10:00:00.000Z',
  };
  const h: Harness = {
    read: vi.fn(() => options.read ?? Promise.resolve(settings)),
    setOwnership: vi.fn().mockResolvedValue(settings),
    setMaintenance: vi.fn().mockResolvedValue(settings),
    listChanges: vi.fn().mockResolvedValue(options.changes ?? []),
    confirm: vi.fn().mockResolvedValue(options.confirmed ?? true),
  };

  TestBed.configureTestingModule({
    imports: [OperationsPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: config },
      { provide: ConfirmService, useValue: { ask: h.confirm } },
      {
        provide: SettingsService,
        useValue: {
          read: h.read,
          listChanges: h.listChanges,
          setMaintenance: h.setMaintenance,
          setOwnership: h.setOwnership,
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(OperationsPage);
  fixture.detectChanges();
  // A read left hanging never settles, so a spec that asserts on the waiting
  // state drives the fixture itself once it has released the answer.
  if (!options.read) {
    await fixture.whenStable();
    fixture.detectChanges();
  }
  return { fixture, el: fixture.nativeElement as HTMLElement, h };
}

/** The switches in template order: maintenance first, then one per area. */
function switches(el: HTMLElement): HTMLButtonElement[] {
  return [...el.querySelectorAll<HTMLButtonElement>('button[role=switch]')];
}

const maintenanceSwitch = (el: HTMLElement) => switches(el)[0];
const catalogSwitch = (el: HTMLElement) => switches(el)[1];

async function openHistory(
  fixture: Awaited<ReturnType<typeof render>>['fixture'],
  el: HTMLElement,
): Promise<void> {
  const lid = el.querySelector<HTMLButtonElement>(
    'app-disclosure-toggle button',
  );
  if (!lid) throw new Error('no history lid');
  lid.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('OperationsPage', () => {
  it('carries both switches, maintenance first, from one read', async () => {
    // Both are one row in the database; asking twice would paint the screen in
    // two stages for no gain.
    const { el, h } = await render();

    expect(h.read).toHaveBeenCalledTimes(1);
    expect(switches(el)).toHaveLength(2);
    expect(el.textContent).toContain(text.maintenanceHeading);
    expect(el.textContent).toContain(text.ownershipHeading);
  });

  it('shows neither switch until the settings arrive', async () => {
    let release: ((settings: AppSettings) => void) | undefined;
    const { el, fixture } = await render({
      read: new Promise<AppSettings>((resolve) => (release = resolve)),
    });

    expect(switches(el)).toHaveLength(0);

    release?.({
      maintenanceEnabled: false,
      ownedAreas: [],
      updatedAt: '2026-09-10T10:00:00.000Z',
    });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(switches(el)).toHaveLength(2);
  });

  describe('maintenance mode', () => {
    it('says the shop is live, and flips without asking', async () => {
      // No confirmation, as there was none on the panel: it is the switch
      // reached in a hurry and reversed by the same click.
      const { el, h, fixture } = await render({ maintenanceOn: false });
      expect(el.textContent).toContain(maintenanceText.statusOff);

      maintenanceSwitch(el).click();
      await fixture.whenStable();

      expect(h.confirm).not.toHaveBeenCalled();
      expect(h.setMaintenance).toHaveBeenCalledWith(true);
      // The write answers with the whole row, so nothing is read back.
      expect(h.read).toHaveBeenCalledTimes(1);
    });

    it('says the shop is hidden when it is on', async () => {
      const { el } = await render({ maintenanceOn: true });

      expect(el.textContent).toContain(maintenanceText.statusOn);
      expect(maintenanceSwitch(el).getAttribute('aria-checked')).toBe('true');
    });
  });

  describe('data ownership', () => {
    it('says the shop is in charge, and what follows from that', async () => {
      const { el } = await render({ owned: false });

      expect(el.textContent).toContain(ownershipText.statusOwn);
      expect(el.textContent).toContain(ownershipText.statusOwnEffect);
      expect(catalogSwitch(el).getAttribute('aria-checked')).toBe('false');
    });

    it('says an external system is in charge when an area is handed over', async () => {
      const { el } = await render({ owned: true });

      expect(el.textContent).toContain(ownershipText.statusOwned);
      expect(el.textContent).toContain(ownershipText.statusOwnedEffect);
      expect(catalogSwitch(el).getAttribute('aria-checked')).toBe('true');
    });

    it('confirms before handing an area over', async () => {
      const { el, h } = await render({ owned: false });

      catalogSwitch(el).click();
      await Promise.resolve();

      expect(h.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ heading: ownershipText.handTitle }),
      );
    });

    it('warns about taking it back in the other direction', async () => {
      const { el, h } = await render({ owned: true });

      catalogSwitch(el).click();
      await Promise.resolve();

      expect(h.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ heading: ownershipText.takeTitle }),
      );
    });

    it('changes nothing when the confirmation is declined', async () => {
      const { el, h, fixture } = await render({
        owned: false,
        confirmed: false,
      });

      catalogSwitch(el).click();
      await fixture.whenStable();

      expect(h.setOwnership).not.toHaveBeenCalled();
    });
  });

  describe('the trail', () => {
    it('is not fetched until the lid is opened', async () => {
      // It answers "since when", which is not why an operator came here.
      const { el, h, fixture } = await render({ changes: [change()] });
      expect(h.listChanges).not.toHaveBeenCalled();

      await openHistory(fixture, el);

      expect(h.listChanges).toHaveBeenCalled();
    });

    it('reads a maintenance change as maintenance, not as an area', async () => {
      // The trail covers both switches; an ownership sentence over a
      // maintenance row would name an area that is not there.
      const { el, fixture } = await render({
        changes: [change({ kind: 'maintenance', area: null, enabled: true })],
      });
      await openHistory(fixture, el);

      expect(el.textContent).toContain(text.historyMaintenanceOn);
      expect(el.textContent).toContain('admin@example.com');
    });

    it('names the area for an ownership change', async () => {
      const { el, fixture } = await render({ changes: [change()] });
      await openHistory(fixture, el);

      expect(el.textContent).toContain(ownershipText.areas.catalog);
    });

    it('names a deleted account rather than leaving the line blank', async () => {
      const { el, fixture } = await render({
        changes: [change({ actorEmail: null })],
      });
      await openHistory(fixture, el);

      expect(el.textContent).toContain(text.historyActorGone);
    });

    it('says so when nothing has been changed yet', async () => {
      const { el, fixture } = await render({ changes: [] });
      await openHistory(fixture, el);

      expect(el.textContent).toContain(text.historyEmpty);
    });

    // One render per test: TestBed cannot be configured twice in one.
    it('says nothing about a cap on a list that is not full', async () => {
      const { el, fixture } = await render({ changes: [change()] });
      await openHistory(fixture, el);

      expect(el.textContent).not.toContain('most recent');
    });

    it('says the list is capped when it came back full', async () => {
      const { el, fixture } = await render({
        changes: Array.from({ length: 20 }, (_, i) =>
          change({ id: `00000000-0000-0000-0000-00000000${100 + i}` }),
        ),
      });
      await openHistory(fixture, el);

      expect(el.textContent).toContain('most recent');
    });
  });
});
