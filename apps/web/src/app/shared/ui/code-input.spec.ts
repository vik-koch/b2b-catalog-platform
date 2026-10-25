import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { CodeInput } from './code-input';

@Component({
  imports: [CodeInput],
  template: `<app-code-input
    [control]="control"
    [length]="6"
    (completed)="completed.set($event)"
  />`,
})
class Host {
  readonly control = new FormControl('', { nonNullable: true });
  readonly completed = signal<string | null>(null);
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  const input = el.querySelector('input') as HTMLInputElement;
  const boxes = () =>
    [...el.querySelectorAll('[aria-hidden="true"]')].map(
      (box) => box.textContent?.trim() ?? '',
    );
  const type = async (value: string) => {
    input.value = value;
    input.dispatchEvent(new Event('input'));
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

    expect(host.control.value).toBe('123456');
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
    host.control.setValue('123456');
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
    expect(host.control.value).toBe('129456');
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

  it('follows a reset of its control, caret and all', async () => {
    const { host, input, boxes, type, fixture } = await render();
    input.focus();
    await type('123');

    host.control.reset();
    fixture.detectChanges();

    expect(boxes()).toEqual(['', '', '', '', '', '']);
    // The caret is drawn in the first box, not where the third digit was.
    const caretBox = [
      ...fixture.nativeElement.querySelectorAll('[aria-hidden="true"]'),
    ].findIndex((box: Element) => box.querySelector('span'));
    expect(caretBox).toBe(0);
  });

  it('offers the phone’s one-time-code suggestion and a number pad', async () => {
    const { input } = await render();

    expect(input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });
});
