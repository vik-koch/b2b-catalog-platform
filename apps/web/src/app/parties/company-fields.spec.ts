import { TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { companyIdFormat } from '../core/contact-fields';
import { CompanyFields } from './company-fields';
import { PartiesService } from './parties.service';

const formats = defaultDeploymentConfig.companyIdInput?.formats ?? [];
/** Both shapes the demo deployment accepts, as the row names them. */
const examples = formats.map((format) => format.example).join(', ');

const text = {
  suggestionsLabel: 'Company suggestions',
  noSuggestions: 'No matching companies.',
  suggestionCount: '{count} company suggestions',
  idLabel: 'Company ID',
  nameLabel: 'Company name',
  hint: 'e.g. {examples}',
  idFormat: 'Please enter it in one of the expected formats, e.g. {examples}.',
  idRequired: 'Please enter your company ID.',
  nameRequired: 'Please enter your company name.',
};

async function render(options: { required?: boolean } = {}) {
  TestBed.configureTestingModule({
    imports: [CompanyFields],
    providers: [
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: PartiesService, useValue: { suggest: vi.fn(async () => []) } },
    ],
  });

  const required = options.required ?? true;
  const idControl = new FormControl('', {
    nonNullable: true,
    validators: [
      ...(required ? [Validators.required] : []),
      companyIdFormat(formats),
    ],
  });
  const nameControl = new FormControl('', {
    nonNullable: true,
    validators: required ? [Validators.required] : [],
  });

  const fixture = TestBed.createComponent(CompanyFields);
  fixture.componentRef.setInput('idControl', idControl);
  fixture.componentRef.setInput('nameControl', nameControl);
  fixture.componentRef.setInput('text', text);
  fixture.componentRef.setInput('required', required);
  await fixture.whenStable();
  fixture.detectChanges();

  return {
    fixture,
    idControl,
    nameControl,
    el: fixture.nativeElement as HTMLElement,
    type: (control: FormControl<string>, value: string) => {
      control.setValue(value);
      fixture.detectChanges();
    },
    /** What the form does when its FieldErrors decides a message is due. */
    showErrors: () => {
      fixture.componentRef.setInput('idInvalid', idControl.invalid);
      fixture.componentRef.setInput('nameInvalid', nameControl.invalid);
      fixture.detectChanges();
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
    const { el, idControl, type, showErrors } = await render();

    type(idControl, '12345');
    showErrors();

    const message = [...el.querySelectorAll('p')].find((p) =>
      p.textContent?.includes('expected formats'),
    );
    expect(message?.closest('.grid')).toBeNull();
  });

  it('names every accepted shape in its hint', async () => {
    const { el } = await render();

    expect(formats.length).toBeGreaterThan(1);
    expect(el.textContent).toContain(`e.g. ${examples}`);
  });

  it('accepts a number in any of them, spaces and case included', async () => {
    const { idControl, type } = await render();

    type(idControl, 'DE123456789');
    expect(idControl.valid).toBe(true);

    type(idControl, '1234567890');
    expect(idControl.valid).toBe(true);

    type(idControl, 'de 123 456 789');
    expect(idControl.valid).toBe(true);
  });

  it('refuses one in no configured shape, naming them all', async () => {
    const { el, idControl, type, showErrors } = await render();

    type(idControl, '12345');
    showErrors();

    expect(idControl.valid).toBe(false);
    expect(el.textContent).toContain(
      `Please enter it in one of the expected formats, e.g. ${examples}.`,
    );
  });

  // Missing and malformed are different mistakes, and only the first has a
  // message of its own.
  it('says a number is missing before it says it is malformed', async () => {
    const { el, showErrors } = await render();

    showErrors();

    expect(el.textContent).toContain(text.idRequired);
  });

  // Two fields, one message area: both mistakes have to be readable at once.
  it('shows what is wrong with either field, together', async () => {
    const { el, idControl, type, showErrors } = await render();

    type(idControl, '12345');
    showErrors();

    expect(el.textContent).toContain('expected formats');
    expect(el.textContent).toContain(text.nameRequired);
  });

  // An address's company is optional, and passes no required wording in.
  it('asks for nothing where the pair is optional', async () => {
    const { el, showErrors } = await render({ required: false });

    showErrors();

    expect(el.textContent).not.toContain(text.idRequired);
    expect(el.textContent).not.toContain(text.nameRequired);
  });
});
