import { TestBed } from '@angular/core/testing';
import { FormControl, Validators } from '@angular/forms';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { companyIdFormat } from '../core/contact-fields';
import { CompanyIdField } from './company-id-field';

const formats = defaultDeploymentConfig.companyIdInput?.formats ?? [];
/** Both shapes the demo deployment accepts, as the field names them. */
const examples = formats.map((format) => format.example).join(', ');

const text = {
  required: 'Please enter your company registration number.',
  format: 'Please enter it in one of the expected formats, e.g. {examples}.',
  hint: 'Any of the numbers we can invoice against, e.g. {examples}.',
};

async function render(options: { required?: boolean; invalid?: boolean } = {}) {
  TestBed.configureTestingModule({
    imports: [CompanyIdField],
    providers: [
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });

  const control = new FormControl('', {
    nonNullable: true,
    validators: [
      ...(options.required === false ? [] : [Validators.required]),
      companyIdFormat(formats),
    ],
  });

  const fixture = TestBed.createComponent(CompanyIdField);
  fixture.componentRef.setInput('control', control);
  fixture.componentRef.setInput('label', 'Company registration number');
  fixture.componentRef.setInput('text', text);
  fixture.componentRef.setInput('required', options.required ?? true);
  fixture.componentRef.setInput('invalid', options.invalid ?? false);
  await fixture.whenStable();
  fixture.detectChanges();

  return {
    fixture,
    control,
    el: fixture.nativeElement as HTMLElement,
    type: (value: string) => {
      control.setValue(value);
      fixture.detectChanges();
    },
    /**
     * What the form does when its FieldErrors decides the message is due. The
     * message is read off the control through a template method, and only a
     * changed *signal* re-renders it — flipping `invalid` is that signal, in
     * the test as in the form.
     */
    showError: () => {
      fixture.componentRef.setInput('invalid', true);
      fixture.detectChanges();
    },
  };
}

describe('CompanyIdField', () => {
  it('is a plain text input — nothing to pick, nothing prefixed', async () => {
    const { el } = await render();

    expect(el.querySelector('select')).toBeNull();
    expect(el.querySelectorAll('input')).toHaveLength(1);
    expect(el.querySelector('input')?.type).toBe('text');
  });

  // The field asks for a number, not for a kind of number, so its hint names
  // every shape the deployment takes rather than one of them.
  it('names every accepted shape in its hint', async () => {
    const { el } = await render();

    expect(formats.length).toBeGreaterThan(1);
    expect(el.textContent).toContain(examples);
  });

  it('accepts a number in any of them', async () => {
    const { control, type } = await render();

    type('DE123456789');
    expect(control.valid).toBe(true);

    type('1234567890');
    expect(control.valid).toBe(true);
  });

  // Typed the way it is printed on a letterhead. The contract normalizes what
  // travels, so the field must not refuse it first.
  it('takes a number typed with spaces or in lower case', async () => {
    const { control, type } = await render();

    type('de 123 456 789');

    expect(control.valid).toBe(true);
  });

  it('refuses one in no configured shape, naming them all', async () => {
    const { control, el, type, showError } = await render();

    type('12345');
    showError();
    expect(control.valid).toBe(false);
    expect(el.textContent).toContain(
      `Please enter it in one of the expected formats, e.g. ${examples}.`,
    );
  });

  // Missing and malformed are different mistakes, and only the first has a
  // message of its own — an optional field passes none in.
  it('says a number is missing before it says it is malformed', async () => {
    const { el } = await render({ invalid: true });

    expect(el.textContent).toContain(text.required);
  });

  it('falls back to the format message where nothing is required', async () => {
    const { el } = await render({ required: false, invalid: true });

    expect(el.textContent).not.toContain(text.required);
  });
});
