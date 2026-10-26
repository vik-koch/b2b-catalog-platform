import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, maxLength, pattern } from '@angular/forms/signals';
import { CodeInput } from './code-input';
import { FORM_FIELDS } from './form-fields';

@Component({
  imports: [CodeInput, FORM_FIELDS],
  template: `<form [formRoot]="form">
    <app-field [field]="form.code" label="Code">
      <app-code-input [field]="form.code" (completed)="completed.set($event)" />
    </app-field>
  </form>`,
})
class Host {
  readonly form = form(
    signal({ code: '' }),
    (model) => {
      maxLength(model.code, 6);
      pattern(model.code, /^\d{6}$/, { message: 'Six digits' });
    },
    { name: 'code' },
  );
  readonly completed = signal<string | null>(null);
  value(): string {
    return this.form.code().value();
  }
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('app-code-input input') as HTMLInputElement;
  const boxes = () =>
    [...el.querySelectorAll('[aria-hidden="true"]')].map(
      (box) => box.textContent?.trim() ?? '',
    );
  const type = async (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, host: fixture.componentInstance, input, boxes, type };
}

describe('CodeInput', () => {
  it('draws one digit per box', async () => {
    const { boxes, type } = await render();

    await type('123');

    expect(boxes()).toEqual(['1', '2', '3', '', '', '']);
  });

  // A paste, or a phone offering the code from a message.
  it('keeps only the digits of what arrives, up to the length', async () => {
    const { host, boxes, type } = await render();

    await type('12-34 56 78');

    expect(host.value()).toBe('123456');
    expect(boxes()).toEqual(['1', '2', '3', '4', '5', '6']);
  });

  it('says so once every box is filled', async () => {
    const { host, type } = await render();

    await type('12345');
    expect(host.completed()).toBeNull();

    await type('123456');
    expect(host.completed()).toBe('123456');
  });

  it('replaces the digit under the caret rather than pushing the rest along', async () => {
    const { host, input, fixture } = await render();
    host.form.code().value.set('123456');
    fixture.detectChanges();
    input.value = '123456';
    input.setSelectionRange(2, 2);

    const event = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: '9',
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(host.value()).toBe('129456');
  });

  it('refuses a letter before it lands', async () => {
    const { input } = await render();

    const event = new InputEvent('beforeinput', {
      inputType: 'insertText',
      data: 'a',
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('follows a reset of its field, caret and all', async () => {
    const { host, input, boxes, type, fixture } = await render();
    input.focus();
    await type('123');

    host.form.code().value.set('');
    fixture.detectChanges();

    expect(boxes()).toEqual(['', '', '', '', '', '']);
    // The caret is drawn in the first box, not where the third digit was.
    const caretBox = [
      ...fixture.nativeElement.querySelectorAll('[aria-hidden="true"]'),
    ].findIndex((box: Element) => box.querySelector('span'));
    expect(caretBox).toBe(0);
  });

  it('borders its boxes red once the field shows its error', async () => {
    const { input, fixture, type } = await render();
    await type('12');
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    const boxes = [
      ...fixture.nativeElement.querySelectorAll('[aria-hidden="true"]'),
    ] as Element[];
    expect(boxes[5].classList).toContain('border-danger');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('offers the phone’s one-time-code suggestion and a number pad', async () => {
    const { input } = await render();

    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });
});
