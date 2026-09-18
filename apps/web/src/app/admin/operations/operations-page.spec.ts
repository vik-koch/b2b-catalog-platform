import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  AppSettings,
  OWNERSHIP_AREAS,
  OwnershipArea,
  SettingChange,
} from '@b2b-catalog-platform/shared';
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
    /** Which areas are owned, where "all or none" is not the question. */
    ownedAreas?: OwnershipArea[];
    maintenanceOn?: boolean;
    changes?: SettingChange[];
    confirmed?: boolean;
    /** A read left hanging, for the spec that asserts the page waits. */
    read?: Promise<AppSettings>;
  } = {},
) {
  const settings: AppSettings = {
    maintenanceEnabled: options.maintenanceOn ?? false,
    ownedAreas:
      options.ownedAreas ?? (options.owned ? [...OWNERSHIP_AREAS] : []),
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

/**
 * The switches in template order: maintenance, the master, then one per area —
 * the last of which are drawn only while the areas lid is open.
 */
function switches(el: HTMLElement): HTMLButtonElement[] {
  return [...el.querySelectorAll<HTMLButtonElement>('button[role=switch]')];
}

const maintenanceSwitch = (el: HTMLElement) => switches(el)[0];
const masterSwitch = (el: HTMLElement) => switches(el)[1];
const catalogSwitch = (el: HTMLElement) => switches(el)[2];

/** The lids in template order: the areas, then the trail. */
async function openLid(
  fixture: Awaited<ReturnType<typeof render>>['fixture'],
  el: HTMLElement,
  which: 'areas' | 'history',
): Promise<void> {
  const lids = el.querySelectorAll<HTMLButtonElement>(
    'app-disclosure-toggle button',
  );
  const lid = which === 'areas' ? lids[0] : lids[lids.length - 1];
  if (!lid) throw new Error(`no ${which} lid`);
  lid.click();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

const openHistory = (
  fixture: Awaited<ReturnType<typeof render>>['fixture'],
  el: HTMLElement,
) => openLid(fixture, el, 'history');

const openAreas = (
  fixture: Awaited<ReturnType<typeof render>>['fixture'],
  el: HTMLElement,
) => openLid(fixture, el, 'areas');

describe('OperationsPage', () => {
  it('carries both switches, maintenance first, from one read', async () => {
    // Both are one row in the database; asking twice would paint the screen in
    // two stages for no gain.
    const { el, h } = await render();

    expect(h.read).toHaveBeenCalledTimes(1);
    // Maintenance and the master; the per-area switches are behind their lid.
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
      const { el, fixture } = await render({ owned: false });
      await openAreas(fixture, el);

      expect(el.textContent).toContain(ownershipText.statusOwn);
      expect(el.textContent).toContain(
        ownershipText.areaText.catalog.ownEffect,
      );
      expect(catalogSwitch(el).getAttribute('aria-checked')).toBe('false');
    });

    it('says an external system is in charge when an area is handed over', async () => {
      const { el, fixture } = await render({ owned: true });
      await openAreas(fixture, el);

      expect(el.textContent).toContain(ownershipText.statusOwned);
      expect(el.textContent).toContain(
        ownershipText.areaText.catalog.ownedEffect,
      );
      expect(catalogSwitch(el).getAttribute('aria-checked')).toBe('true');
    });

    it('confirms before handing an area over, in that area’s words', async () => {
      const { el, h, fixture } = await render({ owned: false });
      await openAreas(fixture, el);

      catalogSwitch(el).click();
      await Promise.resolve();

      expect(h.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          heading: ownershipText.areaText.catalog.handTitle,
        }),
      );
    });

    it('warns about taking it back in the other direction', async () => {
      const { el, h, fixture } = await render({ owned: true });
      await openAreas(fixture, el);

      catalogSwitch(el).click();
      await Promise.resolve();

      expect(h.confirm).toHaveBeenCalledWith(
        expect.objectContaining({
          heading: ownershipText.areaText.catalog.takeTitle,
        }),
      );
    });

    it('changes nothing when the confirmation is declined', async () => {
      const { el, h, fixture } = await render({
        owned: false,
        confirmed: false,
      });
      await openAreas(fixture, el);

      catalogSwitch(el).click();
      await fixture.whenStable();

      expect(h.setOwnership).not.toHaveBeenCalled();
    });

    it('hands every area over in one request', async () => {
      // One request is what makes it one transaction and one history entry —
      // three requests could half-succeed.
      const { el, h, fixture } = await render({ owned: false });

      masterSwitch(el).click();
      await fixture.whenStable();

      expect(h.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ heading: ownershipText.all.handTitle }),
      );
      expect(h.setOwnership).toHaveBeenCalledTimes(1);
      expect(h.setOwnership).toHaveBeenCalledWith([...OWNERSHIP_AREAS], true);
    });

    it('reads the master off the areas rather than off a flag of its own', async () => {
      const { el } = await render({ owned: true });

      expect(masterSwitch(el).getAttribute('aria-checked')).toBe('true');
      expect(el.textContent).toContain(ownershipText.all.statusOwned);
    });

    it('says "partly" when the areas disagree, and opens the rows', async () => {
      // "Partly" is not an answer, so the screen shows which is which without
      // being asked.
      const { el } = await render({ ownedAreas: ['catalog'] });

      expect(el.textContent).toContain(ownershipText.all.statusMixed);
      expect(masterSwitch(el).getAttribute('aria-checked')).toBe('false');
      // Maintenance, the master, and one row per area now that they disagree.
      expect(switches(el)).toHaveLength(2 + OWNERSHIP_AREAS.length);
    });

    it('keeps the rows shut while the areas agree', async () => {
      const { el } = await render({ owned: true });

      expect(switches(el)).toHaveLength(2);
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

      expect(el.textContent).toContain(ownershipText.areaText.catalog.name);
    });

    it('reads one decision over two areas as one line', async () => {
      // The master switch writes a record per area — each area's own history
      // has to name it — but it was one decision, so it is read as one.
      const { el, fixture } = await render({
        changes: [
          change({ area: 'catalog' }),
          change({
            id: '00000000-0000-0000-0000-0000000000c2',
            area: 'customers',
          }),
        ],
      });
      await openHistory(fixture, el);

      expect(el.querySelectorAll('li')).toHaveLength(1);
      expect(el.textContent).toContain(ownershipText.areaText.catalog.name);
      expect(el.textContent).toContain(ownershipText.areaText.customers.name);
    });

    it('keeps two separate decisions apart', async () => {
      // Same person, same direction, a second later: two flips, two lines.
      const { el, fixture } = await render({
        changes: [
          change({ area: 'catalog' }),
          change({
            id: '00000000-0000-0000-0000-0000000000c2',
            area: 'customers',
            changedAt: '2026-09-10T10:00:01.000Z',
          }),
        ],
      });
      await openHistory(fixture, el);

      expect(el.querySelectorAll('li')).toHaveLength(2);
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
