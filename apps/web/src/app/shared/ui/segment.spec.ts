import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Segment, type SegmentState } from './segment';
import { SegmentGroup, type SegmentTone } from './segment-group';

@Component({
  imports: [Segment, SegmentGroup],
  template: `
    <div appSegmentGroup [tone]="tone()">
      <button appSegment [state]="state()" [locked]="locked()">A</button>
    </div>
    <button appSegment class="alone">B</button>
  `,
})
class Host {
  readonly tone = signal<SegmentTone>('brand');
  readonly state = signal<SegmentState>('selected');
  readonly locked = signal(false);
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    group: el.querySelector('div') as HTMLElement,
    segment: el.querySelector('div button') as HTMLElement,
    alone: el.querySelector('.alone') as HTMLElement,
  };
}

describe('Segment', () => {
  it('draws the chosen segment in its group’s tone', async () => {
    const { fixture, group, segment } = await render();

    expect(group.classList).toContain('border-edge-strong');
    expect(segment.classList).toContain('bg-primary');
    expect(segment.classList).toContain('rounded');

    fixture.componentInstance.tone.set('neutral');
    fixture.detectChanges();

    expect(group.classList).toContain('bg-surface');
    expect(segment.classList).toContain('bg-white');
    expect(segment.classList).toContain('rounded-md');
  });

  it('drops every affordance when locked', async () => {
    const { fixture, segment } = await render();

    fixture.componentInstance.locked.set(true);
    fixture.detectChanges();

    expect(segment.classList).toContain('cursor-not-allowed');
    expect(segment.classList).toContain('bg-ink-disabled');
    expect(segment.classList).not.toContain('cursor-pointer');
  });

  it('takes the brand tone outside a group', async () => {
    const { alone } = await render();

    expect(alone.classList).toContain('text-ink');
    expect(alone.classList).toContain('rounded');
  });
});
