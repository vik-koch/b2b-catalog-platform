import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FileTarget } from './file-target';

@Component({
  imports: [FileTarget],
  template: `
    <input type="text" />
    <input type="checkbox" />
    @if (shown()) {
      <button
        type="button"
        [appFileTarget]="accept()"
        [fileTargetMultiple]="multiple()"
        [disabled]="disabled()"
        (filesReceived)="received.push($event)"
      >
        Upload
      </button>
    }
  `,
})
class Host {
  readonly accept = signal('.csv,text/csv');
  readonly multiple = signal(false);
  readonly disabled = signal(false);
  readonly shown = signal(true);
  readonly received: File[][] = [];
}

async function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  // Attached, so a paste on the body reaches the document's listener.
  document.body.appendChild(root);
  return {
    fixture,
    host: fixture.componentInstance,
    root,
    button: root.querySelector('button') as HTMLButtonElement,
  };
}

const csv = () => new File(['a;b'], 'catalog.csv', { type: 'text/csv' });
// What Windows reports for a .csv once a spreadsheet program owns the type.
const excelCsv = () =>
  new File(['a;b'], 'Catalog.CSV', { type: 'application/vnd.ms-excel' });
const png = () => new File(['x'], 'image.png', { type: 'image/png' });

/** The test DOM has no ClipboardEvent to carry files; the field is enough. */
function paste(target: EventTarget, files: File[]): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files } });
  target.dispatchEvent(event);
  return event;
}

function drop(target: EventTarget, files: File[]): Event {
  const event = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: { files } });
  target.dispatchEvent(event);
  return event;
}

describe('FileTarget', () => {
  afterEach(() => (document.body.innerHTML = ''));

  it('takes a file pasted anywhere on the page', async () => {
    const { host } = await render();
    const file = csv();

    const event = paste(document.body, [file]);

    expect(host.received).toEqual([[file]]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves a paste into a text field alone', async () => {
    const { host, root } = await render();

    const field = root.querySelector('input[type=text]') as HTMLInputElement;

    const event = paste(field, [csv()]);

    expect(host.received).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('still takes a paste while a checkbox has focus', async () => {
    const { host, root } = await render();

    const box = root.querySelector('input[type=checkbox]') as HTMLInputElement;

    paste(box, [csv()]);

    expect(host.received).toHaveLength(1);
  });

  it('leaves a paste that something else already handled', async () => {
    const { host } = await render();
    document.body.addEventListener('paste', (e) => e.preventDefault(), {
      capture: true,
      once: true,
    });

    paste(document.body, [csv()]);

    expect(host.received).toEqual([]);
  });

  it('filters a paste by accept, by extension as well as by type', async () => {
    const { host } = await render();
    const file = excelCsv();

    const ignored = paste(document.body, [png()]);
    paste(document.body, [png(), file]);

    expect(ignored.defaultPrevented).toBe(false);
    expect(host.received).toEqual([[file]]);
  });

  it('matches a type family', async () => {
    const { fixture, host } = await render();
    host.accept.set('image/*');
    await fixture.whenStable();
    const file = png();

    paste(document.body, [csv(), file]);

    expect(host.received).toEqual([[file]]);
  });

  it('hands a drop over unfiltered, so the upload can refuse it', async () => {
    const { host, button } = await render();
    const file = png();

    drop(button, [file]);

    expect(host.received).toEqual([[file]]);
  });

  it('hands over the first file only, unless it takes several', async () => {
    const { fixture, host, button } = await render();
    const [a, b] = [csv(), csv()];

    drop(button, [a, b]);
    host.multiple.set(true);
    await fixture.whenStable();
    drop(button, [a, b]);

    expect(host.received).toEqual([[a], [a, b]]);
  });

  it('marks a drag over it, and clears it on leave and on drop', async () => {
    const { button, fixture } = await render();
    const target = fixture.debugElement
      .query((el) => el.nativeElement === button)
      .injector.get(FileTarget);

    button.dispatchEvent(new Event('dragover', { cancelable: true }));
    expect(target.dragging()).toBe(true);
    button.dispatchEvent(new Event('dragleave'));
    expect(target.dragging()).toBe(false);
    button.dispatchEvent(new Event('dragover', { cancelable: true }));
    drop(button, []);
    expect(target.dragging()).toBe(false);
  });

  it('takes nothing while disabled', async () => {
    const { fixture, host, button } = await render();
    host.disabled.set(true);
    await fixture.whenStable();

    paste(document.body, [csv()]);
    drop(button, [csv()]);

    expect(host.received).toEqual([]);
  });

  it('stops listening once it is gone', async () => {
    const { fixture, host } = await render();
    host.shown.set(false);
    await fixture.whenStable();

    paste(document.body, [csv()]);

    expect(host.received).toEqual([]);
  });
});
