import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import {
  AttributeKeyUsage,
  AttributeValueUsage,
} from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { AttributeInventoryPage } from './attribute-inventory-page';
import { AttributesService } from './attributes.service';

const text = defaultAdminText.attributeInventory;

function key(overrides: Partial<AttributeKeyUsage> = {}): AttributeKeyUsage {
  return {
    key: 'Colour',
    productCount: 4,
    valueCount: 2,
    definition: null,
    ...overrides,
  };
}

function value(
  overrides: Partial<AttributeValueUsage> = {},
): AttributeValueUsage {
  return { value: 'Blue', productCount: 3, numeric: false, ...overrides };
}

async function render(
  options: {
    keys?: AttributeKeyUsage[];
    values?: AttributeValueUsage[];
    confirmed?: boolean;
    /** The `?key=` a link into this screen carries. */
    key?: string;
    /** Leaves the values request unresolved, so the placeholder stays up. */
    pendingValues?: boolean;
  } = {},
) {
  const service = {
    listKeys: vi.fn(async () => options.keys ?? [key()]),
    listValues: vi.fn(() =>
      options.pendingValues
        ? new Promise<AttributeValueUsage[]>(() => undefined)
        : Promise.resolve(options.values ?? [value()]),
    ),
    renameKey: vi.fn(async () => 1),
    renameValue: vi.fn(async () => 1),
  };
  const confirm = { ask: vi.fn(async () => options.confirmed ?? true) };

  // Rendered through the router, not constructed directly: which key is open
  // *is* the `?key=` in the URL, so expanding a row only works if the
  // navigation it triggers binds back to the input.
  TestBed.configureTestingModule({
    providers: [
      provideRouter(
        [{ path: '**', component: AttributeInventoryPage }],
        withComponentInputBinding(),
      ),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: AttributesService, useValue: service },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const harness = await RouterTestingHarness.create();
  const url =
    options.key === undefined
      ? '/admin/attributes/inventory'
      : `/admin/attributes/inventory?key=${encodeURIComponent(options.key)}`;
  await harness.navigateByUrl(url, AttributeInventoryPage);
  const fixture = harness.fixture;
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  const flush = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
  /** Clicks the nth button carrying this accessible name, then re-renders. */
  const press = async (label: string, index = 0) => {
    const buttons = el.querySelectorAll<HTMLElement>(`[aria-label="${label}"]`);
    buttons[index]?.click();
    await flush();
  };
  const expand = async (name: string) => {
    const button = [...el.querySelectorAll<HTMLElement>('button')].find((b) =>
      b.textContent?.includes(name),
    );
    button?.click();
    await flush();
  };
  const type = async (text: string) => {
    const input = el.querySelector<HTMLInputElement>('input[name="rename"]');
    if (!input) throw new Error('no rename field');
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await flush();
  };
  const submit = async () => {
    el.querySelector('form')?.dispatchEvent(
      new Event('submit', { cancelable: true }),
    );
    await flush();
  };

  const location = TestBed.inject(Location);
  /** Expands without waiting for the values: `whenStable` never resolves while
   * the request is deliberately left in flight. */
  const expandOnly = (name: string) => {
    [...el.querySelectorAll<HTMLElement>('button')]
      .find((b) => b.textContent?.includes(name))
      ?.click();
    fixture.detectChanges();
  };

  return {
    el,
    service,
    confirm,
    press,
    expand,
    expandOnly,
    type,
    submit,
    location,
  };
}

/** The list row for one key — the header links carry some of the same words. */
function row(el: HTMLElement, key: string): HTMLElement {
  const found = [...el.querySelectorAll<HTMLElement>('li')].find((li) =>
    li.textContent?.includes(key),
  );
  if (!found) throw new Error(`no row for ${key}`);
  return found;
}

/** A hint badge, and the row's action icons alike, state their sentence as the
 * accessible name rather than as text. */
function badge(row: ParentNode, label: string): Element | null {
  return row.querySelector(`[aria-label="${label}"]`);
}

describe('AttributeInventoryPage', () => {
  it('lists a freetext key with its usage, and no way to a definition', async () => {
    const { el } = await render({
      keys: [key({ key: 'Colour', productCount: 4, valueCount: 2 })],
    });

    expect(el.textContent).toContain('Colour');
    expect(el.textContent).toContain(text.products.replace('{count}', '4'));
    expect(el.textContent).toContain(text.values.replace('{count}', '2'));
    // Most attributes are freetext, and none of them is a problem to be fixed:
    // the affordance is deadened in place rather than dropped, so the row's
    // actions do not shift between one key and the next.
    expect(badge(row(el, 'Colour'), text.notFilterable)).not.toBeNull();
    expect(badge(row(el, 'Colour'), text.toDefinition)).toBeNull();
  });

  it('sends a key the shop filters by to its definition', async () => {
    const { el } = await render({
      keys: [key({ definition: { id: 'def-1', type: 'text' } })],
    });

    const link = badge(row(el, 'Colour'), text.toDefinition);
    // The key is the name: they are matched exactly, which is the whole
    // premise of the registry.
    expect(link?.getAttribute('href')).toBe('/admin/attributes?name=Colour');
    expect(badge(row(el, 'Colour'), text.notFilterable)).toBeNull();
  });

  it('stands in for exactly as many values as the key is known to carry', async () => {
    // The count is on the key's own line before the values are fetched, so the
    // placeholder can be the list rather than a guess at it — nothing below
    // moves when the values land. Held in flight, since the placeholder only
    // exists between the click and the response.
    const { el, expandOnly } = await render({
      keys: [key({ key: 'Colour', valueCount: 5 })],
      pendingValues: true,
    });

    expandOnly('Colour');

    const placeholders = row(el, 'Colour').querySelectorAll(
      'ul[aria-hidden="true"] > li',
    );
    expect(placeholders).toHaveLength(5);
  });

  it('loads a key’s values when it is expanded', async () => {
    const { el, service, expand } = await render({
      keys: [key({ key: 'Colour' })],
      values: [value({ value: 'Blue', productCount: 3 })],
    });

    await expand('Colour');

    expect(service.listValues).toHaveBeenCalledWith('Colour');
    expect(el.textContent).toContain('Blue');
  });

  it('writes the open key to the URL, and takes it back out again', async () => {
    // Written with `replaceState`, not a navigation — the router scrolls the
    // page to the top on every one of those, which threw the list around on
    // each click. What matters is only that the address bar keeps up: a stale
    // `?key=` naming a row collapsed ten clicks ago would reopen it on reload.
    const { expand, location } = await render({
      keys: [key({ key: 'Colour' }), key({ key: 'Roast' })],
    });

    await expand('Roast');
    expect(location.path()).toContain('key=Roast');

    await expand('Roast');
    expect(location.path()).not.toContain('key=');
  });

  it('follows a renamed key in the URL, so the open row stays open', async () => {
    const { press, type, submit, location } = await render({
      keys: [key({ key: 'Colour' })],
      key: 'Colour',
    });

    await press(text.renameKey);
    await type('Color');
    await submit();

    expect(location.path()).toContain('key=Color');
  });

  it('flags a value that drops out of a number attribute’s filter', async () => {
    const { el, expand } = await render({
      keys: [
        key({ key: 'Width', definition: { id: 'def-1', type: 'number' } }),
      ],
      values: [value({ value: 'ca. 30', numeric: false })],
    });

    await expand('Width');

    expect(badge(el, text.notNumeric)).not.toBeNull();
  });

  it('says nothing about numbers under a text attribute', async () => {
    const { el, expand } = await render({
      keys: [key({ key: 'Colour', definition: { id: 'def-1', type: 'text' } })],
      values: [value({ value: 'Blue', numeric: false })],
    });

    await expand('Colour');

    expect(badge(el, text.notNumeric)).toBeNull();
  });

  it('renames a key across the catalog after confirming', async () => {
    const { service, confirm, press, type, submit } = await render({
      keys: [key({ key: 'Lenght' })],
    });

    await press(text.renameKey);
    await type('Length');
    await submit();

    expect(confirm.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        message: text.renameConfirm
          .replace('{from}', 'Lenght')
          .replace('{to}', 'Length'),
      }),
    );
    expect(service.renameKey).toHaveBeenCalledWith({
      from: 'Lenght',
      to: 'Length',
    });
  });

  it('warns that renaming onto an existing key merges the two', async () => {
    const { confirm, press, type, submit } = await render({
      keys: [key({ key: 'Colour' }), key({ key: 'colour' })],
    });

    await press(text.renameKey, 1);
    await type('Colour');
    await submit();

    expect(confirm.ask).toHaveBeenCalledWith(
      expect.objectContaining({
        message: text.mergeConfirm
          .replace('{from}', 'colour')
          .replace('{to}', 'Colour'),
      }),
    );
  });

  it('leaves the catalog alone when the confirmation is declined', async () => {
    const { service, press, type, submit } = await render({
      keys: [key({ key: 'Lenght' })],
      confirmed: false,
    });

    await press(text.renameKey);
    await type('Length');
    await submit();

    expect(service.renameKey).not.toHaveBeenCalled();
  });

  it('asks nothing when the text is unchanged', async () => {
    const { confirm, service, press, submit } = await render({
      keys: [key({ key: 'Colour' })],
    });

    await press(text.renameKey);
    await submit();

    expect(confirm.ask).not.toHaveBeenCalled();
    expect(service.renameKey).not.toHaveBeenCalled();
  });

  it('renames a value under its own key', async () => {
    const { service, expand, press, type, submit } = await render({
      keys: [key({ key: 'Colour' })],
      values: [value({ value: 'blu' })],
    });

    await expand('Colour');
    await press(text.renameValue);
    await type('Blue');
    await submit();

    expect(service.renameValue).toHaveBeenCalledWith({
      key: 'Colour',
      from: 'blu',
      to: 'Blue',
    });
  });

  it('opens the key a link handed it, values and all', async () => {
    // How the product editor's grid hands a row over: the name it carries is
    // the row that should already be open.
    const { el, service } = await render({
      keys: [key({ key: 'Colour' }), key({ key: 'Roast' })],
      values: [value({ value: 'Blue' })],
      key: 'Colour',
    });

    expect(service.listValues).toHaveBeenCalledWith('Colour');
    expect(el.textContent).toContain('Blue');
  });

  it('writes the open key to the URL, and takes it back out again', async () => {
    // Written with `replaceState`, not a navigation — the router scrolls the
    // page to the top on every one of those, which threw the list around on
    // each click. What matters is only that the address bar keeps up: a stale
    // `?key=` naming a row collapsed ten clicks ago would reopen it on reload.
    const { expand, location } = await render({
      keys: [key({ key: 'Colour' }), key({ key: 'Roast' })],
    });

    await expand('Roast');
    expect(location.path()).toContain('key=Roast');

    await expand('Roast');
    expect(location.path()).not.toContain('key=');
  });

  it('follows a renamed key in the URL, so the open row stays open', async () => {
    const { press, type, submit, location } = await render({
      keys: [key({ key: 'Colour' })],
      key: 'Colour',
    });

    await press(text.renameKey);
    await type('Color');
    await submit();

    expect(location.path()).toContain('key=Color');
  });

  it('names an empty value, and renames it in one statement', async () => {
    const { el, service, press, type, submit } = await render({
      keys: [key({ key: 'Roast' })],
      values: [value({ value: '' })],
      key: 'Roast',
    });

    expect(el.textContent).toContain(text.emptyValue);

    await press(text.renameValue);
    await type('Dark');
    await submit();

    expect(service.renameValue).toHaveBeenCalledWith({
      key: 'Roast',
      from: '',
      to: 'Dark',
    });
  });

  it('reports a rename it could not save', async () => {
    const { el, service, press, type, submit } = await render({
      keys: [key({ key: 'Lenght' })],
    });
    service.renameKey.mockRejectedValueOnce(new Error('nope'));

    await press(text.renameKey);
    await type('Length');
    await submit();

    expect(el.textContent).toContain(text.renameError);
  });
});
