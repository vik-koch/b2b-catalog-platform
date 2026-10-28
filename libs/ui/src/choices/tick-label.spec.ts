import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Checkbox } from './checkbox';
import { Radio } from './radio';
import { TickLabel } from './tick-label';

@Component({
  imports: [Checkbox, Radio, TickLabel],
  template: `
    <label uiTickLabel class="row">
      <input type="checkbox" uiCheckbox class="in-row" />
      <span>Remember me</span>
    </label>
    <label uiTickLabel>
      <input type="radio" uiRadio class="radio-in-row" />
      <span>Pick up</span>
    </label>
    <input type="checkbox" uiCheckbox class="alone" />
  `,
})
class Host {}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return (selector: string) => el.querySelector(selector) as HTMLElement;
}

describe('TickLabel', () => {
  it('makes the whole row the hit area', async () => {
    const find = await render();

    expect(find('.row').classList).toContain('cursor-pointer');
    expect(find('.row').classList).toContain(
      'has-[input:disabled]:cursor-not-allowed',
    );
  });

  it('drops the box inside it onto the first line, and no other', async () => {
    const find = await render();

    expect(find('.in-row').classList).toContain('mt-0.5');
    expect(find('.radio-in-row').classList).toContain('mt-0.5');
    expect(find('.alone').classList).not.toContain('mt-0.5');
  });
});
