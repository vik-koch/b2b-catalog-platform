import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShowMoreToggle } from './show-more-toggle';

@Component({
  imports: [ShowMoreToggle],
  template: `<app-show-more-toggle
    [expanded]="expanded()"
    moreLabel="Show more"
    lessLabel="Show less"
    [controls]="controls()"
    (toggled)="toggles.update((n) => n + 1)"
  />`,
})
class Host {
  readonly expanded = signal(false);
  readonly controls = signal('');
  readonly toggles = signal(0);
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

const button = (f: Awaited<ReturnType<typeof render>>) =>
  (f.nativeElement as HTMLElement).querySelector('button') as HTMLButtonElement;

describe('ShowMoreToggle', () => {
  it('names the state it will move to, and announces the one it is in', async () => {
    const f = await render();

    expect(button(f).textContent?.trim()).toBe('Show more');
    expect(button(f).getAttribute('aria-expanded')).toBe('false');

    f.componentInstance.expanded.set(true);
    f.detectChanges();

    expect(button(f).textContent?.trim()).toBe('Show less');
    expect(button(f).getAttribute('aria-expanded')).toBe('true');
  });

  it('reports the press without holding the state', async () => {
    const f = await render();

    button(f).click();
    button(f).click();
    f.detectChanges();

    // Twice, and still collapsed: what it opens belongs to the call site.
    expect(f.componentInstance.toggles()).toBe(2);
    expect(button(f).textContent?.trim()).toBe('Show more');
  });

  it('points at the region it opens only where it was given one', async () => {
    const f = await render();

    expect(button(f).getAttribute('aria-controls')).toBeNull();

    f.componentInstance.controls.set('subcategories');
    f.detectChanges();

    expect(button(f).getAttribute('aria-controls')).toBe('subcategories');
  });
});
