import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DisclosureFrame } from './disclosure-frame';

@Component({
  imports: [DisclosureFrame],
  template: `<div
    uiDisclosureFrame
    class="box rounded-md"
    [open]="open()"
  ></div>`,
})
class Host {
  readonly open = signal(false);
}

describe('DisclosureFrame', () => {
  it('colours the box it is given by whether it is open', async () => {
    TestBed.configureTestingModule({ imports: [Host] });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('.box') as HTMLElement;

    expect(box.classList).toContain('border-edge-strong');
    expect(box.classList).toContain('rounded-md');

    fixture.componentInstance.open.set(true);
    fixture.detectChanges();

    expect(box.classList).toContain('border-secondary');
    expect(box.classList).not.toContain('border-edge-strong');
  });
});
