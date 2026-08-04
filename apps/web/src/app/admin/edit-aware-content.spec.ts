import { signal, WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EditModeService } from './edit-mode.service';
import { editAwareContent } from './edit-aware-content';

/**
 * The gate exists for one reason: a storefront page must not paint for a
 * visitor and then sprout admin controls a moment later. Its data and the
 * session arrive on different requests, so "ready" has to mean both.
 */
function gate(options: {
  dataReady: WritableSignal<boolean>;
  settled: WritableSignal<boolean>;
  enabled?: WritableSignal<boolean>;
  alsoWaitFor?: WritableSignal<boolean>;
}) {
  TestBed.configureTestingModule({
    providers: [
      {
        provide: EditModeService,
        useValue: {
          settled: options.settled,
          enabled: options.enabled ?? signal(false),
        },
      },
    ],
  });
  return TestBed.runInInjectionContext(() =>
    editAwareContent({
      ready: options.dataReady,
      section: 'editMode',
      alsoWaitFor: options.alsoWaitFor,
    }),
  );
}

describe('editAwareContent', () => {
  it('holds the content until the visitor’s role is known', async () => {
    const settled = signal(false);
    const content = gate({ dataReady: signal(true), settled });

    expect(content.ready()).toBe(false);

    settled.set(true);
    expect(content.ready()).toBe(true);
  });

  it('holds it until the data is there, session or no session', async () => {
    const dataReady = signal(false);
    const content = gate({ dataReady, settled: signal(true) });

    expect(content.ready()).toBe(false);

    dataReady.set(true);
    expect(content.ready()).toBe(true);
  });

  // The category grid's "Deleted" overlay: in edit mode the page waits for it,
  // so entering the page reveals the grid and every control in one frame.
  it('waits for the extra gate only while edit mode is on', async () => {
    const enabled = signal(false);
    const alsoWaitFor = signal(false);
    const content = gate({
      dataReady: signal(true),
      settled: signal(true),
      enabled,
      alsoWaitFor,
    });

    expect(content.ready()).toBe(true);

    enabled.set(true);
    expect(content.ready()).toBe(false);

    alsoWaitFor.set(true);
    expect(content.ready()).toBe(true);
  });
});
