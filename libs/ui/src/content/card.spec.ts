import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Card } from './card';

@Component({
  imports: [Card],
  template: `
    <section uiCard class="flat mt-4"></section>
    <div uiCard class="raised" variant="raised" [padded]="padded()"></div>
  `,
})
class Host {
  readonly padded = signal(true);
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const find = (selector: string) => el.querySelector(selector) as HTMLElement;
  return { fixture, flat: find('.flat'), raised: find('.raised') };
}

describe('Card', () => {
  it('draws a white card, lifted and rounder when raised', async () => {
    const { flat, raised } = await render();

    expect(flat.classList).toContain('bg-white');
    expect(flat.classList).toContain('rounded-lg');
    expect(flat.classList).not.toContain('shadow-sm');
    expect(raised.classList).toContain('rounded-xl');
    expect(raised.classList).toContain('shadow-sm');
  });

  it("keeps the caller's own classes", async () => {
    const { flat } = await render();

    expect(flat.classList).toContain('mt-4');
  });

  it('drops the padding when told to', async () => {
    const { fixture, raised } = await render();
    expect(raised.classList).toContain('p-5');

    fixture.componentInstance.padded.set(false);
    fixture.detectChanges();

    expect(raised.classList).not.toContain('p-5');
    expect(raised.classList).toContain('bg-white');
  });
});
