import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form } from '@angular/forms/signals';
import { HoneypotField } from './honeypot-field';

@Component({
  imports: [HoneypotField],
  template: `
    <ui-honeypot-field
      controlId="website"
      [field]="form.website"
      label="Empty"
    />
  `,
})
class Host {
  readonly form = form(signal({ website: '' }));
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el };
}

describe('HoneypotField', () => {
  it('hides a labelled input from people and the tab order', async () => {
    const { el } = await render();
    const host = el.querySelector('ui-honeypot-field') as HTMLElement;
    const input = el.querySelector('#website') as HTMLInputElement;

    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(input.tabIndex).toBe(-1);
    expect(el.querySelector('label')?.htmlFor).toBe('website');
  });

  it('writes what a bot types into the field', async () => {
    const { fixture, el } = await render();
    const input = el.querySelector('#website') as HTMLInputElement;

    input.value = 'http://spam.example';
    input.dispatchEvent(new Event('input'));

    expect(fixture.componentInstance.form.website().value()).toBe(
      'http://spam.example',
    );
  });
});
