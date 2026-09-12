import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerTier, fillText } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { provideOwnership } from '../settings/settings.fixture';
import { TierListPage } from './tier-list-page';
import { TiersService } from './tiers.service';

const text = defaultAdminText.tierList;

function tier(overrides: Partial<CustomerTier> = {}): CustomerTier {
  return {
    id: 'tier-1',
    key: 'wholesale',
    label: 'Wholesale',
    userCount: 0,
    priceCount: 0,
    isDefault: false,
    wouldUnpublish: 0,
    sortOrder: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

/** The list the storefront quotes — a row like any other, badge aside. */
function defaultTier(overrides: Partial<CustomerTier> = {}): CustomerTier {
  return tier({
    id: 'tier-default',
    key: 'default',
    label: 'Base price list',
    isDefault: true,
    ...overrides,
  });
}

/** Renders the page over a stub client, returning both for assertions. */
async function render(
  options: {
    tiers?: CustomerTier[];
    productCount?: number;
    /** Whether an external system owns the catalog (FR-ADM-10). */
    owned?: boolean;
    create?: Awaited<ReturnType<TiersService['create']>>;
    update?: Awaited<ReturnType<TiersService['update']>>;
    remove?: Awaited<ReturnType<TiersService['remove']>>;
    reorder?: CustomerTier[];
    /** What moving the badge took off the storefront. */
    unpublished?: number;
    /** The list as the badge move answers with it. */
    afterDefault?: CustomerTier[];
    confirmed?: boolean;
  } = {},
) {
  const service = {
    list: vi.fn(async () => ({
      tiers: options.tiers ?? [],
      productCount: options.productCount ?? 0,
    })),
    create: vi.fn(async () => options.create ?? { ok: true, tier: tier() }),
    update: vi.fn(async () => options.update ?? { ok: true, tier: tier() }),
    remove: vi.fn(async () => options.remove ?? { ok: true }),
    reorder: vi.fn(async () => options.reorder ?? []),
    setDefault: vi.fn(async () => ({
      tiers: options.afterDefault ?? options.tiers ?? [],
      productCount: options.productCount ?? 0,
      unpublished: options.unpublished ?? 0,
    })),
  };
  const confirm = { ask: vi.fn(async () => options.confirmed ?? true) };

  TestBed.configureTestingModule({
    imports: [TierListPage],
    providers: [
      // The price count links into the product grid.
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      provideOwnership(...(options.owned ? (['catalog'] as const) : [])),
      { provide: TiersService, useValue: service },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const fixture = TestBed.createComponent(TierListPage);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const click = async (selector: string) => {
    el.querySelector<HTMLElement>(selector)?.click();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const type = async (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`no field ${selector}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const submit = async () => {
    el.querySelector('form')?.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const byLabel = (label: string) =>
    el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);

  /** The CDK's own drop event: a real drag cannot be dispatched in jsdom, so
   * the handler is called the way the attribute list's spec calls it. */
  const drop = async (previousIndex: number, currentIndex: number) => {
    (
      fixture.componentInstance as unknown as {
        onDrop(event: { previousIndex: number; currentIndex: number }): void;
      }
    ).onDrop({ previousIndex, currentIndex });
    await fixture.whenStable();
    fixture.detectChanges();
  };

  return { el, service, confirm, click, type, submit, byLabel, drop, fixture };
}

describe('TierListPage', () => {
  it('draws the storefront list as a row, badged, with its account count', async () => {
    const { el } = await render({
      tiers: [defaultTier({ userCount: 7 }), tier({ label: 'Wholesale' })],
    });

    // A row like any other now: it is dragged, renamed and priced like the
    // rest, and the badge is the only thing that marks it.
    const first = el.querySelectorAll('li')[0];
    expect(first.textContent).toContain('Base price list');
    expect(first.textContent).toContain(text.defaultBadge);
    expect(first.textContent).toContain(fillText(text.accounts, { count: 7 }));
    expect(el.querySelectorAll('li')[1].textContent).toContain('Wholesale');
  });

  it('offers no badge move on the list that already carries it', async () => {
    const { el, byLabel } = await render({ tiers: [defaultTier()] });

    expect(el.querySelectorAll('li')[0].textContent).toContain(
      text.defaultBadge,
    );
    expect(byLabel(text.setDefault)).toBeNull();
  });

  it('refuses to delete the storefront list, and says why', async () => {
    const { el, byLabel, service, fixture } = await render({
      tiers: [defaultTier()],
    });

    byLabel(text.delete)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.remove).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.errors['tier-is-default']);
  });

  it('warns what moving the badge takes off the storefront', async () => {
    const { confirm, service, byLabel, fixture } = await render({
      tiers: [defaultTier(), tier({ wouldUnpublish: 3 })],
      unpublished: 3,
    });

    byLabel(text.setDefault)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // The figure is on the row already, so the confirmation states it rather
    // than asking the admin to find out by pressing.
    expect(confirm.ask).toHaveBeenCalled();
    const asked = confirm.ask.mock.calls.at(0)?.at(0) as
      { message: string } | undefined;
    expect(asked?.message).toContain('3');
    expect(service.setDefault).toHaveBeenCalledWith('tier-1');
  });

  it('takes the moved badge from the answer rather than asking again', async () => {
    const { service, byLabel, el, fixture } = await render({
      tiers: [defaultTier(), tier()],
      afterDefault: [
        defaultTier({ isDefault: false }),
        tier({ isDefault: true }),
      ],
    });

    byLabel(text.setDefault)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // The move answers with the whole list, so the screen is not reloaded —
    // and the badge is where the answer put it.
    expect(service.list).toHaveBeenCalledTimes(1);
    expect(el.querySelectorAll('li')[1].textContent).toContain(
      text.defaultBadge,
    );
  });

  it('shows the gap behind a list — what it does not price', async () => {
    const { el } = await render({
      tiers: [defaultTier({ priceCount: 100 }), tier({ priceCount: 98 })],
      productCount: 100,
    });

    expect(el.querySelectorAll('li')[1].textContent).toContain(
      fillText(text.unpriced, { count: 2 }),
    );
  });

  it('creates a tier from the add form', async () => {
    const { service, click, type, submit } = await render();

    await click('button.gap-2');
    await type('#tier-label', 'Wholesale');
    await type('#tier-key', 'wholesale');
    await submit();

    expect(service.create).toHaveBeenCalledWith({
      label: 'Wholesale',
      key: 'wholesale',
    });
    // Reloaded rather than patched in: the server owns the counts.
    expect(service.list).toHaveBeenCalledTimes(2);
  });

  it('rejects a sync key that would not survive a spreadsheet column', async () => {
    const { el, service, click, type, submit } = await render();

    await click('button.gap-2');
    await type('#tier-label', 'Wholesale');
    await type('#tier-key', 'Whole Sale');
    await submit();

    // Refused on the spot, so the user never sees a 400 to interpret.
    expect(service.create).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.keyInvalid);
  });

  it('shows the deployment\u2019s wording when a key is already taken', async () => {
    const { el, click, type, submit } = await render({
      create: { ok: false, code: 'tier-key-taken' },
    });

    await click('button.gap-2');
    await type('#tier-label', 'Wholesale');
    await type('#tier-key', 'wholesale');
    await submit();

    expect(el.textContent).toContain(text.errors['tier-key-taken']);
  });

  it('edits a tier in place, prefilled with its current values', async () => {
    const { el, service, byLabel, type, submit, fixture } = await render({
      tiers: [tier({ id: 'tier-9', key: 'trade', label: 'Trade' })],
    });

    byLabel(text.edit)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector<HTMLInputElement>('#tier-label')?.value).toBe(
      'Trade',
    );
    expect(el.querySelector<HTMLInputElement>('#tier-key')?.value).toBe(
      'trade',
    );

    await type('#tier-label', 'Trade partners');
    await submit();

    expect(service.update).toHaveBeenCalledWith('tier-9', {
      label: 'Trade partners',
      key: 'trade',
    });
  });

  describe('while an external system owns the catalog (FR-ADM-10)', () => {
    const owned = defaultAdminText.ownership;

    it('locks the sync key of a list that already exists, and nothing else', async () => {
      const { el, byLabel, fixture } = await render({
        tiers: [tier({ id: 'tier-9', key: 'trade', label: 'Trade' })],
        owned: true,
      });

      byLabel(text.edit)?.click();
      await fixture.whenStable();
      fixture.detectChanges();

      expect(el.querySelector<HTMLInputElement>('#tier-key')?.disabled).toBe(
        true,
      );
      // The name is what staff read and the exchange never writes it.
      expect(el.querySelector<HTMLInputElement>('#tier-label')?.disabled).toBe(
        false,
      );
      expect(el.textContent).toContain(owned.tierKeyLocked);
    });

    it('leaves the add form alone — a new list has no key the exchange holds', async () => {
      const { el, click } = await render({ tiers: [], owned: true });

      await click('button.gap-2');

      expect(el.querySelector<HTMLInputElement>('#tier-key')?.disabled).toBe(
        false,
      );
      expect(el.textContent).toContain(text.keyHint);
    });
  });

  it('deletes an unreferenced tier after a confirmation', async () => {
    const { service, confirm, byLabel, fixture } = await render({
      tiers: [tier({ id: 'tier-9' })],
    });

    byLabel(text.delete)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(confirm.ask).toHaveBeenCalled();
    expect(service.remove).toHaveBeenCalledWith('tier-9');
  });

  it('explains a blocked delete instead of asking a doomed question', async () => {
    const { el, service, confirm, byLabel, fixture } = await render({
      tiers: [tier({ userCount: 3, priceCount: 12 })],
    });

    byLabel(text.delete)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // The counts are already on screen; the server would refuse this with a
    // 409, so there is nothing to confirm.
    expect(confirm.ask).not.toHaveBeenCalled();
    expect(service.remove).not.toHaveBeenCalled();
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(fillText(text.accounts, { count: 3 }));
    expect(alert?.textContent).toContain(fillText(text.prices, { count: 12 }));
  });

  it('keeps the tier when the confirmation is declined', async () => {
    const { service, byLabel, fixture } = await render({
      tiers: [tier()],
      confirmed: false,
    });

    byLabel(text.delete)?.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(service.remove).not.toHaveBeenCalled();
  });

  describe('display order', () => {
    const a = tier({ id: 'a', key: 'a', label: 'A', sortOrder: 0 });
    const b = tier({ id: 'b', key: 'b', label: 'B', sortOrder: 1 });
    const c = tier({ id: 'c', key: 'c', label: 'C', sortOrder: 2 });

    it('renders tiers in the order the server sent, not alphabetically', async () => {
      const { el } = await render({ tiers: [c, a, b] });

      const labels = [...el.querySelectorAll('li')].map((li) =>
        li.textContent?.trim().charAt(0),
      );
      expect(labels).toEqual(['C', 'A', 'B']);
    });

    it('commits a move as a re-numbered sequence from zero', async () => {
      const { service, drop } = await render({ tiers: [a, b, c] });

      await drop(2, 1);

      // Positions carry no meaning of their own — only the sequence does — so
      // every row is renumbered rather than given a fractional index.
      expect(service.reorder).toHaveBeenCalledWith({
        order: [
          { id: 'a', sortOrder: 0 },
          { id: 'c', sortOrder: 1 },
          { id: 'b', sortOrder: 2 },
        ],
      });
    });

    it('ignores a drop that put the row back where it was', async () => {
      const { drop, service } = await render({ tiers: [a, b, c] });

      await drop(1, 1);

      expect(service.reorder).not.toHaveBeenCalled();
    });

    it('adopts the server’s answer rather than the locally moved array', async () => {
      const { el, drop } = await render({
        tiers: [a, b, c],
        // The server is the authority on order; say it settled differently.
        reorder: [b, c, a],
      });

      await drop(0, 1);

      const labels = [...el.querySelectorAll('li')].map((li) =>
        li.textContent?.trim().charAt(0),
      );
      expect(labels).toEqual(['B', 'C', 'A']);
    });

    it('reports a failed move and reloads what is actually stored', async () => {
      const { el, service, drop } = await render({ tiers: [a, b, c] });
      service.reorder.mockRejectedValueOnce(new Error('boom'));

      await drop(0, 1);

      expect(el.textContent).toContain(text.reorderError);
      expect(service.list).toHaveBeenCalledTimes(2);
    });
  });
});
