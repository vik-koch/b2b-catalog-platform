import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AttributeDefinition } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../../config/app-text';
import { ADMIN_TEXT } from '../../config/admin-text';
import { defaultAppText } from '../../config/app-text.fixture';
import { defaultAdminText } from '../../config/admin-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../config/deployment-config';
import { defaultDeploymentConfig } from '../../config/deployment-config.fixture';
import { ConfirmService } from '../../ui/confirm.service';
import { AttributeListPage } from './attribute-list-page';
import { AttributesService } from './attributes.service';

const text = defaultAdminText.attributeList;

function definition(
  overrides: Partial<AttributeDefinition> = {},
): AttributeDefinition {
  return {
    id: 'attr-1',
    name: 'Colour',
    slug: 'colour',
    type: 'text',
    unit: null,
    sortOrder: 0,
    productCount: 4,
    valueCount: 3,
    unparsedCount: 0,
    updatedAt: '2026-08-19T00:00:00.000Z',
    ...overrides,
  };
}

/** Renders the page over a stub client, returning both for assertions. */
async function render(
  options: {
    definitions?: AttributeDefinition[];
    create?: Awaited<ReturnType<AttributesService['create']>>;
    update?: Awaited<ReturnType<AttributesService['update']>>;
    remove?: Awaited<ReturnType<AttributesService['remove']>>;
    reorder?: AttributeDefinition[];
    confirmed?: boolean;
  } = {},
) {
  const service = {
    list: vi.fn(async () => options.definitions ?? []),
    create: vi.fn(
      async () => options.create ?? { ok: true, definition: definition() },
    ),
    update: vi.fn(
      async () => options.update ?? { ok: true, definition: definition() },
    ),
    remove: vi.fn(async () => options.remove ?? { ok: true }),
    reorder: vi.fn(async () => options.reorder ?? []),
  };
  const confirm = { ask: vi.fn(async () => options.confirmed ?? true) };

  TestBed.configureTestingModule({
    imports: [AttributeListPage],
    providers: [
      provideRouter([]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: AttributesService, useValue: service },
      { provide: ConfirmService, useValue: confirm },
    ],
  });
  const fixture = TestBed.createComponent(AttributeListPage);
  await fixture.whenStable();
  fixture.detectChanges();

  const el = fixture.nativeElement as HTMLElement;
  /** Settles the pending request and re-renders — every interaction ends here. */
  const flush = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };
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
  const select = async (selector: string, value: string) => {
    const field = el.querySelector<HTMLSelectElement>(selector);
    if (!field) throw new Error(`no field ${selector}`);
    field.value = value;
    field.dispatchEvent(new Event('change'));
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
  /** Clicks the one button carrying this accessible name, then re-renders. */
  const press = async (label: string) => {
    el.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)?.click();
    await flush();
  };

  /** Clicks a row's move button; `row` is the position in the list. */
  const move = async (row: number, direction: 'up' | 'down') => {
    const label = direction === 'up' ? text.moveUp : text.moveDown;
    const buttons = el.querySelectorAll<HTMLButtonElement>(
      `[aria-label="${label}"]`,
    );
    buttons[row].click();
    await flush();
  };

  return { el, service, confirm, click, type, select, submit, press, move };
}

describe('AttributeListPage', () => {
  it('lists a definition with its slug, type and usage', async () => {
    const { el } = await render({
      definitions: [
        definition({
          type: 'number',
          unit: 'cm',
          productCount: 4,
          valueCount: 3,
        }),
      ],
    });

    expect(el.textContent).toContain('Colour');
    expect(el.textContent).toContain('colour');
    // The unit rides with the type: it is a property of the definition, not of
    // any one value.
    expect(el.textContent).toContain(`${text.types.number} (cm)`);
    expect(el.textContent).toContain(text.products.replace('{count}', '4'));
    expect(el.textContent).toContain(text.values.replace('{count}', '3'));
  });

  it('says so when a name matches no product, which is the mistyped case', async () => {
    const { el } = await render({
      definitions: [definition({ productCount: 0, valueCount: 0 })],
    });

    expect(el.textContent).toContain(text.noMatch);
  });

  it('reports unparseable values on a number attribute', async () => {
    const { el } = await render({
      definitions: [definition({ type: 'number', unparsedCount: 2 })],
    });

    expect(el.textContent).toContain(text.unparsed.replace('{count}', '2'));
  });

  it('says nothing about unparseable values on a text attribute', async () => {
    // Text has no numeric reading to fail, so the same count is not a finding.
    const { el } = await render({
      definitions: [definition({ type: 'text', unparsedCount: 2 })],
    });

    expect(el.textContent).not.toContain(text.unparsed.replace('{count}', '2'));
  });

  it('creates a definition, leaving the slug to the server when blank', async () => {
    const { service, click, type, select, submit } = await render();

    await click('button:has(app-admin-icon[name="plus"])');
    await type('#attribute-name', '  Width  ');
    await select('#attribute-type', 'number');
    await type('#attribute-unit', ' cm ');
    await submit();

    expect(service.create).toHaveBeenCalledWith({
      name: 'Width',
      slug: undefined,
      type: 'number',
      unit: 'cm',
    });
  });

  it('sends an empty unit as null rather than an empty string', async () => {
    const { service, click, type, submit } = await render();

    await click('button:has(app-admin-icon[name="plus"])');
    await type('#attribute-name', 'Colour');
    await submit();

    expect(service.create).toHaveBeenCalledWith({
      name: 'Colour',
      slug: undefined,
      type: 'text',
      unit: null,
    });
  });

  it('refuses an unusable slug before the request', async () => {
    const { el, service, click, type, submit } = await render();

    await click('button:has(app-admin-icon[name="plus"])');
    await type('#attribute-name', 'Colour');
    await type('#attribute-slug', 'Not A Slug');
    await submit();

    expect(service.create).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.slugInvalid);
  });

  it('edits in place, prefilled from the row', async () => {
    const { el, service, press, type, submit } = await render({
      definitions: [definition({ name: 'Lenght', slug: 'lenght' })],
    });

    await press(text.edit);
    const name = el.querySelector<HTMLInputElement>('#attribute-name');
    expect(name?.value).toBe('Lenght');

    await type('#attribute-name', 'Length');
    await submit();

    expect(service.update).toHaveBeenCalledWith('attr-1', {
      name: 'Length',
      // The slug is kept as it is: filtered links already carry it.
      slug: 'lenght',
      type: 'text',
      unit: null,
    });
  });

  it('names the refusal the server gave', async () => {
    const { el, click, type, submit } = await render({
      create: { ok: false, code: 'attribute-name-taken' },
    });

    await click('button:has(app-admin-icon[name="plus"])');
    await type('#attribute-name', 'Colour');
    await submit();

    expect(el.textContent).toContain(text.errors['attribute-name-taken']);
  });

  it('deletes after a confirmation, since a filter disappears from the shop', async () => {
    const { service, confirm, press } = await render({
      definitions: [definition()],
    });

    await press(text.delete);

    expect(confirm.ask).toHaveBeenCalled();
    expect(service.remove).toHaveBeenCalledWith('attr-1');
  });

  it('keeps the definition when the confirmation is declined', async () => {
    const { service, press } = await render({
      definitions: [definition()],
      confirmed: false,
    });

    await press(text.delete);

    expect(service.remove).not.toHaveBeenCalled();
  });

  it('commits a move as positions numbered from zero', async () => {
    const { service, move } = await render({
      definitions: [
        definition({ id: 'a', name: 'Colour', sortOrder: 0 }),
        definition({ id: 'b', name: 'Width', sortOrder: 1 }),
      ],
    });

    await move(1, 'up');

    expect(service.reorder).toHaveBeenCalledWith({
      order: [
        { id: 'b', sortOrder: 0 },
        { id: 'a', sortOrder: 1 },
      ],
    });
  });

  it('reports a move it could not save and reloads the stored order', async () => {
    const { el, service, move } = await render({
      definitions: [definition({ id: 'a' }), definition({ id: 'b' })],
    });
    service.reorder.mockRejectedValueOnce(new Error('nope'));

    await move(1, 'up');

    expect(el.textContent).toContain(text.reorderError);
    expect(service.list).toHaveBeenCalledTimes(2);
  });
});
