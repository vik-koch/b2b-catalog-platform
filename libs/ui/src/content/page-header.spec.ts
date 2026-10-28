import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PageHeader } from './page-header';

@Component({
  imports: [PageHeader],
  template: `
    <ui-page-header id="with" title="Tiers" [intro]="intro()">
      <button type="button">Add</button>
    </ui-page-header>
    <ui-page-header id="without" title="Runs" />
  `,
})
class Host {
  readonly intro = signal<string | undefined>('Price lists by customer.');
}

async function render() {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement };
}

describe('PageHeader', () => {
  it('puts the actions in the title row', async () => {
    const { el } = await render();
    const title = el.querySelector('#with h1');

    expect(title?.textContent?.trim()).toBe('Tiers');
    expect(title?.parentElement?.querySelector('button')?.textContent).toBe(
      'Add',
    );
  });

  it('says the intro under the row, and nothing where there is none', async () => {
    const { el, fixture } = await render();

    expect(el.querySelector('#with p')?.textContent).toContain('Price lists');
    expect(el.querySelector('#without p')).toBeNull();

    fixture.componentInstance.intro.set(undefined);
    await fixture.whenStable();
    expect(el.querySelector('#with p')).toBeNull();
  });
});
