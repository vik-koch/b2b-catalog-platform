import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Outcome } from './outcome';

@Component({
  imports: [Outcome],
  template: `
    <ui-outcome class="ended" title="Done" message="It worked." role="status">
      <a href="/">Home</a>
    </ui-outcome>
    <ui-outcome class="bare" title="Closed" message="Nothing to do." />
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

describe('Outcome', () => {
  it('draws the title, the sentence and the ways on', async () => {
    const find = await render();

    expect(find('.ended h1').textContent).toContain('Done');
    expect(find('.ended p').getAttribute('role')).toBe('status');
    expect(find('.ended div a').textContent).toBe('Home');
  });

  // An empty row would still push the next thing down by its margin.
  it('leaves the actions row empty, and hidden, without actions', async () => {
    const find = await render();

    expect(find('.bare p').hasAttribute('role')).toBe(false);
    const actions = find('.bare div');
    expect(actions.childElementCount).toBe(0);
    expect(actions.classList).toContain('empty:hidden');
  });
});
