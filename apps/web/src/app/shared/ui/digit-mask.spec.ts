import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { form, FormField } from '@angular/forms/signals';
import { DigitMask } from './digit-mask';
import { DIGIT_MASK_FORMAT, DigitMaskFormat } from './digit-mask-format';

/** A stand-in for the app's rule, which has its own spec where it lives. */
const format: DigitMaskFormat = {
  apply: (value, mask) => {
    const digits = value.replace(/\D/g, '');
    if (!mask) return digits;
    let out = '';
    let next = 0;
    for (const ch of mask) {
      if (next >= digits.length) break;
      out += ch === '#' ? digits[next++] : ch;
    }
    return out;
  },
  stripPrefix: (value, prefix) =>
    value.startsWith(prefix) ? value.slice(prefix.length) : value,
};

@Component({
  imports: [FormField, DigitMask],
  template: `
    <input
      appDigitMask
      [mask]="mask()"
      [prefix]="prefix()"
      [formField]="field"
    />
  `,
})
class Host {
  prefix = signal('');
  // A signal, so changing it marks the view for check — which is what makes
  // the binding re-evaluate, as a picker changing the format does in the app.
  mask = signal('(###) ###-####');
  readonly value = signal('');
  readonly field = form(this.value);
}

async function render(mask?: string, prefix?: string) {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [{ provide: DIGIT_MASK_FORMAT, useValue: format }],
  });
  const fixture = TestBed.createComponent(Host);
  if (mask !== undefined) fixture.componentInstance.mask.set(mask);
  if (prefix !== undefined) fixture.componentInstance.prefix.set(prefix);
  await fixture.whenStable();
  const input = fixture.nativeElement.querySelector(
    'input',
  ) as HTMLInputElement;
  const type = async (raw: string) => {
    input.value = raw;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  };
  return { fixture, input, type };
}

describe('DigitMask', () => {
  /**
   * The company-id picker changes the mask under a live field. What was written
   * to it must be re-grouped by the new mask — from the value the form gave,
   * not from what the old mask left on screen, which a shorter mask has already
   * trimmed.
   */
  it('re-applies a changed mask to the value it was given', async () => {
    const { fixture, input } = await render('#####');

    fixture.componentInstance.value.set('1234567890');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('12345');

    fixture.componentInstance.mask.set('##########');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input.value).toBe('1234567890');
    expect(fixture.componentInstance.value()).toBe('1234567890');
  });

  it('formats digits into the mask and writes the formatted value to the field', async () => {
    const { fixture, input, type } = await render();

    await type('0301234567');

    expect(input.value).toBe('(030) 123-4567');
    expect(fixture.componentInstance.value()).toBe('(030) 123-4567');
  });

  it('keeps the field to what a mask that arrives with the value shows', async () => {
    const { fixture, input } = await render('##########');

    fixture.componentInstance.value.set('1234567890');
    fixture.componentInstance.mask.set('#####');
    await fixture.whenStable();

    expect(input.value).toBe('12345');
    expect(fixture.componentInstance.value()).toBe('12345');
  });

  it('paints a form write that matches an earlier typed value', async () => {
    const { fixture, input, type } = await render('#####');

    await type('12345');
    fixture.componentInstance.value.set('');
    await fixture.whenStable();
    expect(input.value).toBe('');

    fixture.componentInstance.value.set('12345');
    await fixture.whenStable();

    expect(input.value).toBe('12345');
  });

  it('ignores non-digits and caps at the mask length', async () => {
    const { input, type } = await render();

    await type('030-123-4567-9999');

    expect(input.value).toBe('(030) 123-4567');
  });

  it('formats progressively as digits are entered', async () => {
    const { input, type } = await render();

    await type('030');

    expect(input.value).toBe('(030');
  });

  it('with an empty mask keeps digits only', async () => {
    const { input, type } = await render('');

    await type('+49 (30) 12');

    expect(input.value).toBe('493012');
  });

  // Autofill writes the whole number under a code the form draws itself;
  // kept, the code would be stored twice.
  describe('a value that arrives carrying the prefix', () => {
    it('has it taken off, typed or autofilled', async () => {
      const { input, fixture, type } = await render('(###) ###-####', '+49');

      await type('+49 40 1234567');
      expect(input.value).toBe('(401) 234-567');
      expect(fixture.componentInstance.value()).toBe('(401) 234-567');
    });

    it('has it taken off when the form writes one in', async () => {
      const { input, fixture } = await render('(###) ###-####', '+49');

      fixture.componentInstance.value.set('+49 40 1234567');
      await fixture.whenStable();

      expect(input.value).toBe('(401) 234-567');
    });

    it('strips nothing where the deployment configures no code', async () => {
      const { input, type } = await render('(###) ###-####');

      await type('+49 40 1234567');

      expect(input.value).toBe('(494) 012-3456');
    });
  });
});
