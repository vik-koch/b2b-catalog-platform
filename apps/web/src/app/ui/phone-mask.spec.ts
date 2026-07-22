import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { PhoneMask } from './phone-mask';

@Component({
  imports: [ReactiveFormsModule, PhoneMask],
  template: `<input appPhoneMask [mask]="mask" [formControl]="control" />`,
})
class Host {
  mask = '(###) ###-####';
  control = new FormControl('');
}

async function render(mask?: string) {
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  if (mask !== undefined) fixture.componentInstance.mask = mask;
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

describe('PhoneMask', () => {
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
