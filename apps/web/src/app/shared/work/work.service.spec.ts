import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthUser, WorkCounts } from '@b2b-catalog-platform/shared';
import { AuthService } from '../auth/auth.service';
import { adminUser } from '../auth/auth-user.fixture';
import { WorkService } from './work.service';

/**
 * The counts in the browser: when they are asked for, and what the marker makes
 * of them. The endpoint is stubbed at the service's own client — what is under
 * test is the fetching policy, not the wire, which orpc-client.spec owns.
 */

/** Lets a fetch complete: every hop through the service is a microtask. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function setup(
  answers: (WorkCounts | 'fail')[] = [{}],
  user: AuthUser | null = adminUser,
) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      provideRouter([{ path: '**', children: [] }]),
      {
        provide: AuthService,
        useValue: {
          user: signal(user),
          whenResolved: () => Promise.resolve(),
        },
      },
    ],
  });

  const service = TestBed.inject(WorkService);
  let asked = 0;
  // Swapped in before the constructor's own first fetch gets past its await on
  // the session, so nothing here ever reaches the network.
  (
    service as unknown as {
      client: { getCounts: () => Promise<WorkCounts> };
    }
  ).client = {
    getCounts: () => {
      const answer = answers[Math.min(asked, answers.length - 1)];
      asked++;
      return answer === 'fail'
        ? Promise.reject(new Error('down'))
        : Promise.resolve(answer);
    },
  };
  await flush();

  return {
    service,
    router: TestBed.inject(Router),
    calls: () => asked,
  };
}

describe('WorkService', () => {
  it('lights the marker on the total across every queue', async () => {
    const { service } = await setup([{ registrations: 2, orders: 3 }]);

    expect(service.total()).toBe(5);
    expect(service.waiting()).toBe(true);
  });

  it('keeps the marker dark when every queue is empty', async () => {
    const { service } = await setup([{ registrations: 0, orders: 0 }]);

    expect(service.waiting()).toBe(false);
  });

  it('asks again on a change of page, and clears what was done', async () => {
    const { service, router, calls } = await setup([
      { orders: 1 },
      { orders: 0 },
    ]);
    expect(calls()).toBe(1);

    await router.navigateByUrl('/admin/orders');
    await flush();

    expect(calls()).toBe(2);
    expect(service.waiting()).toBe(false);
  });

  /**
   * The admin grids rewrite their query string on every keystroke of a search
   * box. A count has nothing to do with a filter, so asking per keystroke would
   * be one request per letter typed.
   */
  it('does not ask again when only the query string changed', async () => {
    const { router, calls } = await setup([{ orders: 1 }]);
    await router.navigateByUrl('/admin/orders');
    await flush();
    const before = calls();

    await router.navigateByUrl('/admin/orders?searchTerm=ha');
    await router.navigateByUrl('/admin/orders?searchTerm=haf');
    await flush();

    expect(calls()).toBe(before);
  });

  it('asks nothing at all while signed out', async () => {
    const { service, calls } = await setup([{ orders: 5 }], null);

    expect(calls()).toBe(0);
    expect(service.counts()).toEqual({});
  });

  // A failed count is no count: the account control stays quiet rather than
  // growing an error nobody can act on.
  it('draws nothing when the endpoint fails', async () => {
    const { service } = await setup(['fail']);

    expect(service.counts()).toEqual({});
    expect(service.waiting()).toBe(false);
  });
});
