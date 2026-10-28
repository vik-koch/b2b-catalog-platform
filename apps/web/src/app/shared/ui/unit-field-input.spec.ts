import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UnitField } from './unit-field';
import { UnitFieldInput } from './unit-field-input';

@Component({
  imports: [UnitField, UnitFieldInput],
  template: `
    <app-unit-field unit="pcs" [compact]="compact()">
      <input appUnitFieldInput />
    </app-unit-field>
  `,
})
class Host {
  readonly compact = signal(false);
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const input = (fixture.nativeElement as HTMLElement).querySelector(
    'input',
  ) as HTMLInputElement;
  return { fixture, input };
}

describe('UnitFieldInput', () => {
  it('is a bare box filling the field’s row', async () => {
    const { input } = await render();

    expect(input.classList).toContain('flex-1');
    expect(input.classList).toContain('bg-transparent');
    expect(input.classList).not.toContain('sm:pr-1');
  });

  it('sits close up to its unit in a compact field', async () => {
    const { fixture, input } = await render();

    fixture.componentInstance.compact.set(true);
    fixture.detectChanges();

    expect(input.classList).toContain('sm:pr-1');
  });
});
