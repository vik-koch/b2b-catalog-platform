import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { StatusBadge, StatusBadgeVariant, StatusTone } from './status-badge';

@Component({
  imports: [StatusBadge],
  template: `<span appStatusBadge [tone]="tone()" [variant]="variant()"
    >State</span
  >`,
})
class Host {
  readonly tone = signal<StatusTone>('neutral');
  readonly variant = signal<StatusBadgeVariant>('solid');
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('StatusBadge', () => {
  it('is the filled pill by default', async () => {
    const fixture = await render();
    const badge = (fixture.nativeElement as HTMLElement).querySelector(
      'span',
    ) as HTMLSpanElement;

    fixture.componentInstance.tone.set('ok');
    fixture.detectChanges();

    expect(badge.classList.contains('rounded-full')).toBe(true);
    expect(badge.classList.contains('bg-success-surface')).toBe(true);
    expect(badge.className).not.toContain('before:');
  });

  it('carries the tone in the dot alone in the dot variant', async () => {
    const fixture = await render();
    const badge = (fixture.nativeElement as HTMLElement).querySelector(
      'span',
    ) as HTMLSpanElement;

    fixture.componentInstance.tone.set('ok');
    fixture.componentInstance.variant.set('dot');
    fixture.detectChanges();

    // The dot is a pseudo-element, so the tone has to reach it through a
    // variant class — the one thing a swapped colour could quietly drop.
    expect(badge.classList.contains('before:bg-success-dot')).toBe(true);
    // And the tone reaches nothing else: field, border and label stay neutral
    // whatever the state, which is the whole difference from the filled pill.
    expect(badge.classList.contains('bg-white')).toBe(true);
    expect(badge.classList.contains('border-edge')).toBe(true);
    expect(badge.classList.contains('text-ink-subtle')).toBe(true);
    expect(badge.className).not.toContain('green-100');
    expect(badge.classList.contains('rounded-full')).toBe(false);
  });
});
