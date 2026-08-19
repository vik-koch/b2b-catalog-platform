import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
  } = {},
) {
  const service = {
    listKeys: vi.fn(async () => options.keys ?? [key()]),
    listValues: vi.fn(async () => options.values ?? [value()]),
    renameKey: vi.fn(async () => 1),
    renameValue: vi.fn(async () => 1),
  };
  const confirm = { ask: vi.fn(async () => options.confirmed ?? true) };

  TestBed.configureTestingModule({
    imports: [AttributeInventoryPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: AttributesService, useValue: service },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const fixture = TestBed.createComponent(AttributeInventoryPage);
  if (options.key !== undefined) {
    fixture.componentRef.setInput('key', options.key);
  }
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

  return { el, service, confirm, press, expand, type, submit };
}

/** The list row for one key — the header links carry some of the same words. */
function row(el: HTMLElement, key: string): HTMLElement {
  const found = [...el.querySelectorAll<HTMLElement>('li')].find((li) =>
    li.textContent?.includes(key),
  );
  if (!found) throw new Error(`no row for ${key}`);
  return found;
}

describe('AttributeInventoryPage', () => {
  it('lists a freetext key with its usage, unbadged', async () => {
    const { el } = await render({
      keys: [key({ key: 'Colour', productCount: 4, valueCount: 2 })],
    });

    expect(el.textContent).toContain('Colour');
    expect(el.textContent).toContain(text.products.replace('{count}', '4'));
    expect(el.textContent).toContain(text.values.replace('{count}', '2'));
    // Most attributes are freetext; only the declared ones are badged. Read
    // off the row, since the header's link to the registry says the word too.
    expect(row(el, 'Colour').textContent).not.toContain(text.filterable);
  });

  it('marks a key the shop already filters by', async () => {
    const { el } = await render({
      keys: [key({ definition: { id: 'def-1', type: 'text' } })],
    });

    expect(row(el, 'Colour').textContent).toContain(text.filterable);
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

  it('flags a value that drops out of a number attribute’s filter', async () => {
    const { el, expand } = await render({
      keys: [
        key({ key: 'Width', definition: { id: 'def-1', type: 'number' } }),
      ],
      values: [value({ value: 'ca. 30', numeric: false })],
    });

    await expand('Width');

    expect(el.textContent).toContain(text.notNumeric);
  });

  it('says nothing about numbers under a text attribute', async () => {
    const { el, expand } = await render({
      keys: [key({ key: 'Colour', definition: { id: 'def-1', type: 'text' } })],
      values: [value({ value: 'Blue', numeric: false })],
    });

    await expand('Colour');

    expect(el.textContent).not.toContain(text.notNumeric);
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
