import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DisclosureFrame } from './disclosure-frame';
import { Frame } from './frame';

@Component({
  imports: [Frame, DisclosureFrame],
  template: `
    <span appFrame class="photo"></span>
    <button appFrame class="thumb" [selected]="selected()" [pressable]="true">
      Press me
    </button>
    <div appDisclosureFrame class="box rounded-md" [open]="open()"></div>
  `,
})
class Host {
  readonly selected = signal(false);
  readonly open = signal(false);
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const find = (selector: string) => el.querySelector(selector) as HTMLElement;
  return {
    fixture,
    photo: find('.photo'),
    thumb: find('.thumb'),
    box: find('.box'),
  };
}

describe('Frame', () => {
  it('draws the hairline, and heavier on the chosen one', async () => {
    const { fixture, photo, thumb } = await render();

    expect(photo.classList).toContain('ring-1');
    expect(photo.classList).not.toContain('hover:ring-accent');
    expect(thumb.classList).toContain('hover:ring-accent');

    fixture.componentInstance.selected.set(true);
    fixture.detectChanges();

    expect(thumb.classList).toContain('ring-2');
    expect(thumb.classList).not.toContain('ring-1');
  });
});

describe('DisclosureFrame', () => {
  it('colours the box it is given by whether it is open', async () => {
    const { fixture, box } = await render();

    expect(box.classList).toContain('border-edge-strong');
    expect(box.classList).toContain('rounded-md');

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    expect(box.classList).toContain('border-secondary');
    expect(box.classList).not.toContain('border-edge-strong');
  });
});
