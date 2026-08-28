import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CustomerTier } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConfirmService } from '../../ui/confirm.service';
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
    sortOrder: 0,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

/** Renders the page over a stub client, returning both for assertions. */
async function render(
  options: {
    tiers?: CustomerTier[];
    defaultUserCount?: number;
    create?: Awaited<ReturnType<TiersService['create']>>;
    update?: Awaited<ReturnType<TiersService['update']>>;
    remove?: Awaited<ReturnType<TiersService['remove']>>;
    reorder?: CustomerTier[];
    confirmed?: boolean;
  } = {},
) {
  const service = {
    list: vi.fn(async () => ({
      tiers: options.tiers ?? [],
      defaultUserCount: options.defaultUserCount ?? 0,
    })),
    create: vi.fn(async () => options.create ?? { ok: true, tier: tier() }),
    update: vi.fn(async () => options.update ?? { ok: true, tier: tier() }),
    remove: vi.fn(async () => options.remove ?? { ok: true }),
    reorder: vi.fn(async () => options.reorder ?? []),
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

/** The pinned, non-draggable base-list block: the card's first child. */
function baseRow(el: HTMLElement): HTMLElement {
  const row = el.querySelector<HTMLElement>('.rounded-lg > div:first-child');
  if (!row) throw new Error('no base price list row');
  return row;
}

describe('TierListPage', () => {
  it('always shows the base list first, with its account count', async () => {
    const { el } = await render({
      tiers: [tier({ label: 'Wholesale' })],
      defaultUserCount: 7,
    });

    // The base list is not a tier and has no id, but it is the first thing an
    // admin looking at price lists needs to see — and it sits outside the
    // draggable list, since it is not a row anyone can move.
    const base = baseRow(el);
    expect(base.textContent).toContain(text.defaultLabel);
    expect(base.textContent).toContain('7 account(s)');
    expect(el.querySelectorAll('li')[0].textContent).toContain('Wholesale');
  });

  it('offers no actions on the base list — there is nothing stored to change', async () => {
    const { el } = await render({ tiers: [] });

    expect(baseRow(el).querySelector('button')).toBeNull();
    expect(el.textContent).toContain(text.empty);
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
    expect(alert?.textContent).toContain('3 account(s)');
    expect(alert?.textContent).toContain('12 product price(s)');
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
