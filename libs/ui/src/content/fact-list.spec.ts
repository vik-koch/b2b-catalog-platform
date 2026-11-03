import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FACT_LIST } from './fact-list';

@Component({
  imports: [FACT_LIST],
  template: `
    <dl uiFactList class="wide text-sm">
      <dt uiFactTerm>Email</dt>
      <dd uiFactValue class="flex">a&#64;example.com</dd>
    </dl>
    <dl uiFactList terms="narrow" class="narrow"></dl>
  `,
})
class Host {}

async function render() {
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return (selector: string) => el.querySelector(selector) as HTMLElement;
}

describe('FactList', () => {
  it('sizes the term column by `terms`, wide by default', async () => {
    const find = await render();

    expect(find('.wide').className).toContain('sm:grid-cols-[12rem_1fr]');
    expect(find('.narrow').className).toContain('sm:grid-cols-[7rem_1fr]');
  });

  // A page sets the text size and lays out a value holding controls.
  it("keeps the caller's own classes beside its own", async () => {
    const find = await render();

    expect(find('.wide').classList).toContain('text-sm');
    expect(find('.wide').classList).toContain('grid');
    expect(find('dd').classList).toContain('flex');
    expect(find('dd').classList).toContain('min-w-0');
    expect(find('dt').classList).toContain('text-ink-subtle');
  });
});
