import { TestBed } from '@angular/core/testing';
import { Page as PageContent } from '@b2b-catalog-platform/shared';
import { APP_TEXT } from '../config/app-text';
import { defaultAppText } from '../config/app-text.fixture';
import { PageEditor } from './page-editor';
import { PageService } from './page.service';

const text = defaultAppText.pageEditor;

const about: PageContent = {
  title: 'About us',
  bodyHtml: '<p>Original copy.</p>',
  updatedAt: '2026-07-25T10:00:00.000Z',
};

async function render(updatePage = vi.fn()) {
  TestBed.configureTestingModule({
    imports: [PageEditor],
    providers: [
      { provide: APP_TEXT, useValue: defaultAppText },
      { provide: PageService, useValue: { updatePage } },
    ],
  });
  const fixture = TestBed.createComponent(PageEditor);
  fixture.componentRef.setInput('slug', 'about');
  fixture.componentRef.setInput('page', about);
  await fixture.whenStable();
  return { fixture, el: fixture.nativeElement as HTMLElement, updatePage };
}

function buttonNamed(el: HTMLElement, label: string): HTMLButtonElement {
  const button = [...el.querySelectorAll('button')].find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) {
    throw new Error(`no button labelled "${label}"`);
  }
  return button;
}

describe('PageEditor', () => {
  it('seeds the title field from the page', async () => {
    const { el } = await render();

    expect(el.querySelector('input')?.value).toBe('About us');
  });

  it('shows the body in a prose container when previewing', async () => {
    const { fixture, el } = await render();

    buttonNamed(el, text.preview).click();
    await fixture.whenStable();

    expect(el.querySelector('.prose')?.innerHTML).toContain('Original copy.');
    expect(el.textContent).toContain(text.previewNotice);
    // The title renders as it will on the real page, not as an input.
    expect(el.querySelector('input')).toBeNull();
  });

  it('returns to editing from preview', async () => {
    const { fixture, el } = await render();

    buttonNamed(el, text.preview).click();
    await fixture.whenStable();
    buttonNamed(el, text.resumeEditing).click();
    await fixture.whenStable();

    expect(el.querySelector('input')?.value).toBe('About us');
  });

  it('saves the current title and body, and emits what the server stored', async () => {
    const stored = { ...about, title: 'Renamed', bodyHtml: '<p>Clean.</p>' };
    const { fixture, el, updatePage } = await render(
      vi.fn().mockResolvedValue(stored),
    );
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);

    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'Renamed';
    input.dispatchEvent(new Event('input'));
    buttonNamed(el, text.save).click();
    await fixture.whenStable();

    expect(updatePage).toHaveBeenCalledWith('about', {
      title: 'Renamed',
      bodyHtml: about.bodyHtml,
    });
    expect(saved).toHaveBeenCalledWith(stored);
  });

  it('refuses to save a blank title and does not call the server', async () => {
    const { fixture, el, updatePage } = await render();

    const input = el.querySelector('input') as HTMLInputElement;
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    buttonNamed(el, text.save).click();
    await fixture.whenStable();

    expect(updatePage).not.toHaveBeenCalled();
    expect(el.textContent).toContain(text.titleRequired);
  });

  it('reports a failed save and stays open', async () => {
    const { fixture, el } = await render(
      vi.fn().mockRejectedValue(new Error('boom')),
    );

    buttonNamed(el, text.save).click();
    await fixture.whenStable();

    expect(el.textContent).toContain(text.saveError);
    expect(el.querySelector('input')).not.toBeNull();
  });

  it('closes without confirmation when nothing was changed', async () => {
    const { fixture, el } = await render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const confirm = vi.spyOn(window, 'confirm');

    buttonNamed(el, text.cancel).click();
    await fixture.whenStable();

    expect(confirm).not.toHaveBeenCalled();
    expect(closed).toHaveBeenCalled();
  });

  it('keeps the editor open when a discard is declined', async () => {
    const { fixture, el } = await render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    const input = el.querySelector('input') as HTMLInputElement;
    input.value = 'Changed';
    input.dispatchEvent(new Event('input'));
    buttonNamed(el, text.cancel).click();
    await fixture.whenStable();

    expect(closed).not.toHaveBeenCalled();
  });
});
