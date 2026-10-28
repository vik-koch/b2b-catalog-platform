import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Notice, NoticeTone } from './notice';

@Component({
  imports: [Notice],
  template: `<p uiNotice [tone]="tone()" class="mb-6" role="status">Saved</p>`,
})
class Host {
  readonly tone = signal<NoticeTone>('warning');
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const notice = (fixture.nativeElement as HTMLElement).querySelector(
    'p',
  ) as HTMLParagraphElement;
  return { fixture, notice };
}

describe('Notice', () => {
  it('draws its tone’s text on its tone’s ground, inside its tone’s line', async () => {
    const { notice } = await render();

    expect(notice.classList).toContain('bg-warning-surface');
    expect(notice.classList).toContain('text-warning-ink');
    expect(notice.classList).toContain('border-warning-edge');
  });

  it('follows a change of tone', async () => {
    const { fixture, notice } = await render();

    fixture.componentInstance.tone.set('danger');
    fixture.detectChanges();

    expect(notice.classList).toContain('bg-danger-surface');
    expect(notice.classList).not.toContain('bg-warning-surface');
  });

  it('draws the neutral tone quiet, with no line around it', async () => {
    const { fixture, notice } = await render();

    fixture.componentInstance.tone.set('neutral');
    fixture.detectChanges();

    expect(notice.classList).toContain('bg-surface');
    expect(notice.classList).toContain('text-ink-subtle');
    expect(notice.classList).toContain('border-transparent');
  });

  it('leaves the page its own spacing and role', async () => {
    const { notice } = await render();

    expect(notice.classList).toContain('mb-6');
    expect(notice.getAttribute('role')).toBe('status');
  });
});
