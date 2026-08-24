import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DigitMask } from './digit-mask';

@Component({
  imports: [ReactiveFormsModule, DigitMask],
  template: `<input appDigitMask [mask]="mask()" [formControl]="control" />`,
})
class Host {
  // A signal, so changing it marks the view for check — which is what makes
  // the binding re-evaluate, as a picker changing the format does in the app.
  mask = signal('(###) ###-####');
  control = new FormControl('');
}

async function render(mask?: string) {
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  if (mask !== undefined) fixture.componentInstance.mask.set(mask);
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

    fixture.componentInstance.control.setValue('1234567890');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(input.value).toBe('12345');

    fixture.componentInstance.mask.set('##########');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(input.value).toBe('1234567890');
    expect(fixture.componentInstance.control.value).toBe('1234567890');
  });

  it('formats digits into the mask and writes the formatted value to the control', async () => {
    const { fixture, input, type } = await render();

    await type('0301234567');

    expect(input.value).toBe('(030) 123-4567');
    expect(fixture.componentInstance.control.value).toBe('(030) 123-4567');
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
});
