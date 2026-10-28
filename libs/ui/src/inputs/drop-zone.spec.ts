import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DropZone } from './drop-zone';
import { FileTarget } from './file-target';

@Component({
  imports: [DropZone, FileTarget],
  template: `
    <button uiDropZone uiFileTarget [filled]="filled()" type="button">
      Drop
    </button>
  `,
})
class Host {
  readonly filled = signal(false);
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const zone = (fixture.nativeElement as HTMLElement).querySelector(
    'button',
  ) as HTMLButtonElement;
  return { fixture, zone };
}

describe('DropZone', () => {
  it('invites a pointer while empty', async () => {
    const { zone } = await render();

    expect(zone.classList).toContain('border-dashed');
    expect(zone.classList).toContain('hover:border-accent');
  });

  it('fills while a file is dragged over the target on the same element', async () => {
    const { fixture, zone } = await render();

    zone.dispatchEvent(new Event('dragover', { cancelable: true }));
    fixture.detectChanges();

    expect(zone.classList).toContain('bg-primary/5');
    expect(zone.classList).not.toContain('hover:border-accent');
  });

  it('stops inviting once it holds something', async () => {
    const { fixture, zone } = await render();

    fixture.componentInstance.filled.set(true);
    fixture.detectChanges();

    expect(zone.classList).not.toContain('hover:border-accent');
    expect(zone.classList).toContain('border-dashed');
  });
});
