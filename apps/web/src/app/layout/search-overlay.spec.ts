import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { DEPLOYMENT_CONFIG } from '../config/deployment-config';
import { defaultDeploymentConfig } from '../config/deployment-config.fixture';
import { MobileSearch } from './mobile-search';
import { SearchOverlay } from './search-overlay';

function render() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [SearchOverlay],
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
    ],
  });
  const search = TestBed.inject(MobileSearch);
  const fixture = TestBed.createComponent(SearchOverlay);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;

  return {
    search,
    row: () => el.querySelector('div'),
    // Not `whenStable`: these tests drive the exit timer by hand, and fake
    // timers are exactly what a stability check waits on.
    rerender: () => fixture.detectChanges(),
  };
}

describe('SearchOverlay', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove('search-locked');
    document.body.style.top = '';
  });

  it('draws nothing until the field is asked for', () => {
    const view = render();

    expect(view.row()).toBeNull();
  });

  // An element the template has already removed has nothing left to animate,
  // so the row outlives the closed state by the length of its exit.
  it('stays for its exit animation, then goes', () => {
    const view = render();
    view.search.activate();
    view.rerender();
    expect(view.row()?.className).toContain('animate-search-drop');

    view.search.close();
    view.rerender();
    expect(view.row()?.className).toContain('animate-search-lift');

    vi.advanceTimersByTime(200);
    view.rerender();
    expect(view.row()).toBeNull();
  });

  // Asking for it again mid-exit is one overlay being reopened, not a second
  // one arriving behind the first.
  it('comes straight back when reopened while leaving', () => {
    const view = render();
    view.search.activate();
    view.rerender();
    view.search.close();
    view.rerender();

    view.search.activate();
    view.rerender();
    expect(view.row()?.className).toContain('animate-search-drop');

    vi.advanceTimersByTime(200);
    view.rerender();
    expect(view.row()).not.toBeNull();
  });
});
