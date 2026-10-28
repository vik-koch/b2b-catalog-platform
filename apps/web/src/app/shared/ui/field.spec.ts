import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, required, validate } from '@angular/forms/signals';
import { FORM_FIELDS } from './form-fields';
import { UI_TEXT } from '@b2b-catalog-platform/ui/core/ui-text';

const uiText = { required: 'required' };

@Component({
  imports: [FORM_FIELDS],
  template: `
    <form [formRoot]="form">
      <app-field
        [field]="form.code"
        label="Code"
        [hint]="hint()"
        controlId="code"
        describedBy="answer"
      >
        <button appFieldAction type="button">Show</button>
        <input [formField]="form.code" />
      </app-field>
      <app-field-group [field]="form.size" label="Size" hint="Pick one">
        <input type="radio" value="s" [formField]="form.size" />
        <input type="radio" value="m" [formField]="form.size" />
      </app-field-group>
      <input id="trap" aria-describedby="trap-hint" [formField]="form.trap" />
      <button type="submit">Send</button>
    </form>
  `,
})
class Host {
  readonly hint = signal<string | undefined>('Five digits');
  readonly sent = signal(0);
  readonly form = form(
    signal({ code: '', size: '', trap: '' }),
    (model) => {
      required(model.code, { message: 'Enter a code' });
      validate(model.code, ({ value }) =>
        value() && value().length !== 5
          ? { kind: 'length', message: 'Five digits' }
          : undefined,
      );
      required(model.size, { message: 'Pick a size' });
    },
    {
      submission: {
        action: async () => {
          this.sent.update((n) => n + 1);
        },
      },
    },
  );
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [{ provide: UI_TEXT, useValue: uiText }],
  });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector<HTMLInputElement>('#code') as HTMLInputElement;
  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  const type = async (value: string) => {
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const leave = async () => {
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    input.dispatchEvent(new FocusEvent('blur'));
    await settle();
  };
  const submit = async () => {
    el.querySelector<HTMLButtonElement>('button[type="submit"]')?.click();
    await settle();
  };
  const errorOf = (id: string) => el.querySelector(`#${id}-error`);
  return { fixture, el, input, type, leave, submit, errorOf };
}

describe('Field', () => {
  it('names the control by its caption and marks it required from the schema', async () => {
    const { el, input } = await render();

    const label = el.querySelector('label[for="code"]');
    expect(label?.textContent).toContain('Code');
    expect(label?.querySelector('[aria-hidden="true"]')?.textContent).toBe('*');
    expect(input.required).toBe(true);
    expect(input.getAttribute('aria-required')).toBe('true');
  });

  it('points the control at its hint while there is no error', async () => {
    const { el, input } = await render();

    expect(input.getAttribute('aria-describedby')).toBe('code-hint answer');
    expect(el.querySelector('#code-hint')?.textContent).toContain(
      'Five digits',
    );
  });

  // Rule 2: tabbing through a form is not a mistake.
  it('keeps a missing required value quiet until the form is sent', async () => {
    const { input, leave, submit, errorOf, fixture } = await render();

    input.focus();
    await leave();
    expect(errorOf('code')).toBeNull();
    expect(input.hasAttribute('aria-invalid')).toBe(false);

    await submit();
    expect(errorOf('code')?.textContent).toContain('Enter a code');
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('code-error answer');
    expect(fixture.componentInstance.sent()).toBe(0);
  });

  // Rule 3: shown once left, hidden again while it is being edited.
  it('shows any other error once the field is left, and hides it on the next edit', async () => {
    const { type, leave, errorOf } = await render();

    await type('12');
    expect(errorOf('code')).toBeNull();

    await leave();
    expect(errorOf('code')?.textContent).toContain('Five digits');

    await type('123');
    expect(errorOf('code')).toBeNull();

    await type('12345');
    await leave();
    expect(errorOf('code')).toBeNull();
  });

  it('describes a group on its fieldset and leaves its inputs unnamed', async () => {
    const { el, submit } = await render();
    const fieldset = el.querySelector('fieldset') as HTMLFieldSetElement;
    const radios = [...el.querySelectorAll('fieldset input')];

    expect(fieldset.querySelector('legend')?.textContent).toContain('Size');
    expect(fieldset.getAttribute('aria-describedby')).toMatch(/-hint$/);
    expect(radios.every((radio) => !radio.hasAttribute('id'))).toBe(true);

    await submit();
    expect(fieldset.getAttribute('aria-describedby')).toMatch(
      /-hint \S+-error$/,
    );
    expect(fieldset.textContent).toContain('Pick a size');
  });

  it('says a required group is required in its name, which takes no aria-required', async () => {
    const { el } = await render();
    const legend = el.querySelector('legend') as HTMLLegendElement;

    expect(legend.querySelector('.sr-only')?.textContent?.trim()).toBe(
      uiText.required,
    );
    expect(el.querySelector('fieldset')?.hasAttribute('aria-required')).toBe(
      false,
    );
  });

  it('draws a caption-row action beside the caption, not in the control', async () => {
    const { el } = await render();
    const label = el.querySelector('label[for="code"]');

    expect(label?.parentElement?.querySelector('button')?.textContent).toBe(
      'Show',
    );
    expect(label?.parentElement?.classList).toContain('justify-between');
  });

  it('leaves a control outside any field with its own attributes', async () => {
    const { el } = await render();
    const trap = el.querySelector('#trap');

    expect(trap).not.toBeNull();
    expect(trap?.getAttribute('aria-describedby')).toBe('trap-hint');
    expect(trap?.hasAttribute('aria-invalid')).toBe(false);
  });
});
