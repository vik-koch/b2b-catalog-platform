import { TestBed } from '@angular/core/testing';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { HeaderCollapse } from './header-collapse';
import { ScrollToTop } from './scroll-to-top';

async function render() {
  TestBed.configureTestingModule({
    imports: [ScrollToTop],
    providers: [{ provide: APP_TEXT, useValue: defaultAppText }],
  });
  const fixture = TestBed.createComponent(ScrollToTop);
  await fixture.whenStable();
  const el = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    collapse: TestBed.inject(HeaderCollapse),
    button: el.querySelector('button') as HTMLButtonElement,
  };
}

describe('ScrollToTop', () => {
  it('has nothing to undo while the header is still expanded', async () => {
    const { button } = await render();

    expect(button.disabled).toBe(true);
  });

  it('goes live with the header collapsing, and scrolls back to the top', async () => {
    const scrollTo = vi
      .spyOn(window, 'scrollTo')
      .mockImplementation(() => undefined);
    const { fixture, collapse, button } = await render();

    collapse.update(500);
    await fixture.whenStable();

    expect(button.disabled).toBe(false);
    button.click();
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
