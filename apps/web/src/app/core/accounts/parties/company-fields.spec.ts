import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { form, required } from '@angular/forms/signals';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../../platform/config/deployment-config.fixture';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { defaultSharedText } from '../../../platform/config/shared-text.fixture';
import { STOREFRONT_TEXT } from '../../../platform/config/storefront-text';
import { defaultStorefrontText } from '../../../platform/config/storefront-text.fixture';
import { FORM_FIELDS } from '@b2b-catalog-platform/ui/fields/form-fields';
import { PartySuggestion } from '@b2b-catalog-platform/shared/core/accounts';
import { CompanyFields } from './company-fields';
import { companyIdFormat } from './company-id';
import { PartiesService } from './parties.service';
import { PartySuggestInput } from './party-suggest-input';

const formats = defaultDeploymentConfig.companyIdInput?.formats ?? [];
/** Both shapes the demo deployment accepts, as the row names them. */
const examples = formats.map((format) => format.example).join(', ');

const hint = 'e.g. {examples}';
const messages = {
  idFormat: 'Please enter it in one of the expected formats, e.g. {examples}.',
  idRequired: 'Please enter your company ID.',
  nameRequired: 'Please enter your company name.',
};

@Component({
  imports: [FORM_FIELDS, CompanyFields],
  template: `
    <form [formRoot]="form">
      <app-company-fields
        [idField]="form.id"
        [nameField]="form.name"
        [hint]="hint"
        (picked)="picked = $event"
      />
      <button type="submit">Send</button>
    </form>
  `,
})
class Host {
  protected readonly hint = hint;
  picked: PartySuggestion | undefined;
  readonly form = form(
    signal({ id: '', name: '' }),
    (company) => {
      required(company.id, { message: messages.idRequired });
      companyIdFormat(company.id, formats, messages.idFormat);
      required(company.name, { message: messages.nameRequired });
    },
    { name: 'company', submission: { action: async () => undefined } },
  );
}

async function render() {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: STOREFRONT_TEXT, useValue: defaultStorefrontText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      { provide: PartiesService, useValue: { suggest: vi.fn(async () => []) } },
    ],
  });

  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };

  return {
    el,
    host: fixture.componentInstance,
    /** A row picked in the field at `index`, as its list would emit it. */
    pick: async (index: number, party: PartySuggestion) => {
      fixture.debugElement
        .queryAll(By.directive(PartySuggestInput))
        [index].componentInstance.picked.emit(party);
      await settle();
    },
    type: async (selector: string, value: string) => {
      const input = el.querySelector<HTMLInputElement>(selector);
      if (!input) throw new Error(`no ${selector}`);
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await settle();
    },
    submit: async () => {
      el.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
      await settle();
    },
  };
}

describe('CompanyFields', () => {
  it('puts both fields in one row, each a plain text input', async () => {
    const { el } = await render();

    expect(el.querySelector('select')).toBeNull();
    expect(el.querySelectorAll('input')).toHaveLength(2);
    expect(el.querySelector('#companyId')).not.toBeNull();
    expect(el.querySelector('#companyName')).not.toBeNull();
  });

  // The number's column is ten characters wide; a message wrapped into five
  // lines under it is worse than no layout at all.
  it('spans its messages under the row rather than under a column', async () => {
    const { el, type, submit } = await render();

    await type('#companyId', '12345');
    await submit();

    const message = [...el.querySelectorAll('p')].find((p) =>
      p.textContent?.includes('expected formats'),
    );
    expect(message).toBeDefined();
    expect(message?.closest('.grid')).toBeNull();
  });

  it('points both fields at the line under the row', async () => {
    const { el } = await render();
    const line = el.querySelector('.grid + div');

    expect(line?.id).toBeTruthy();
    for (const id of ['#companyId', '#companyName']) {
      expect(el.querySelector(id)?.getAttribute('aria-describedby')).toBe(
        line?.id,
      );
    }
  });

  it('names every accepted shape in its hint', async () => {
    const { el } = await render();

    expect(formats.length).toBeGreaterThan(1);
    expect(el.textContent).toContain(`e.g. ${examples}`);
  });

  it('accepts a number in any of them, spaces and case included', async () => {
    const { host, type } = await render();

    await type('#companyId', 'DE123456789');
    expect(host.form.id().valid()).toBe(true);

    await type('#companyId', '1234567890');
    expect(host.form.id().valid()).toBe(true);

    await type('#companyId', 'de 123 456 789');
    expect(host.form.id().valid()).toBe(true);
  });

  it('refuses one in no configured shape, naming them all', async () => {
    const { el, host, type, submit } = await render();

    await type('#companyId', '12345');
    await submit();

    expect(host.form.id().valid()).toBe(false);
    expect(el.textContent).toContain(
      `Please enter it in one of the expected formats, e.g. ${examples}.`,
    );
  });

  // Missing and malformed are different mistakes, and only the first has a
  // message of its own.
  it('says a number is missing before it says it is malformed', async () => {
    const { el, submit } = await render();

    await submit();

    expect(el.textContent).toContain(messages.idRequired);
    expect(el.textContent).not.toContain('expected formats');
  });

  // Either field takes the query, so a row picked in either fills both.
  it('fills both fields from a row picked in either', async () => {
    const { host, pick } = await render();
    const party: PartySuggestion = {
      name: 'Kontor GmbH',
      registrationId: 'DE123456789',
      entityType: 'legal',
    };

    await pick(0, party);

    expect(host.form.name().value()).toBe('Kontor GmbH');
    expect(host.form.id().value()).toBe('DE123456789');
    expect(host.picked).toBe(party);
  });

  it('keeps a typed number where the picked row has none', async () => {
    const { host, type, pick } = await render();

    await type('#companyId', 'DE123456789');
    await pick(1, { name: 'Kontor' });

    expect(host.form.name().value()).toBe('Kontor');
    expect(host.form.id().value()).toBe('DE123456789');
  });

  // Two fields, one message area: both mistakes have to be readable at once.
  it('shows what is wrong with either field, together', async () => {
    const { el, type, submit } = await render();

    await type('#companyId', '12345');
    await submit();

    expect(el.textContent).toContain('expected formats');
    expect(el.textContent).toContain(messages.nameRequired);
    // The hint gives way to the messages rather than sitting beside them.
    expect(el.querySelector('.grid + div p.text-ink-subtle')).toBeNull();
  });
});
