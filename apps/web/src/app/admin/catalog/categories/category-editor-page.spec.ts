import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { ADMIN_TEXT } from '../../../platform/config/admin-text';
import { defaultAdminText } from '../../../platform/config/admin-text.fixture';
import { SHARED_TEXT } from '../../../platform/config/shared-text';
import { defaultSharedText } from '../../../platform/config/shared-text.fixture';
import { DEPLOYMENT_CONFIG } from '../../../platform/config/deployment-config';
import { defaultDeploymentConfig } from '../../../platform/config/deployment-config.fixture';
import { CatalogUploadsService } from '../uploads/catalog-uploads.service';
import { provideOwnership } from '../../platform/ownership/ownership.fixture';
import { CategoriesService } from './categories.service';
import { CategoryEditorPage } from './category-editor-page';
import { defaultAdminCatalogText } from '../catalog-text.fixture';

const text = defaultAdminCatalogText.categories.editor;

async function render(slug?: string) {
  let finish: (value: unknown) => void = () => undefined;
  const service = {
    list: vi.fn(async () => []),
    create: vi.fn(() => new Promise((resolve) => (finish = resolve))),
  };
  TestBed.configureTestingModule({
    imports: [CategoryEditorPage],
    providers: [
      provideRouter([]),
      { provide: ADMIN_TEXT, useValue: defaultAdminText },
      { provide: SHARED_TEXT, useValue: defaultSharedText },
      provideOwnership(),
      { provide: DEPLOYMENT_CONFIG, useValue: defaultDeploymentConfig },
      { provide: CategoriesService, useValue: service },
      { provide: CatalogUploadsService, useValue: {} },
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap(slug ? { slug } : {}),
            queryParamMap: convertToParamMap({}),
          },
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CategoryEditorPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, service, finish: () => finish({ ok: false }) };
}

describe('CategoryEditorPage', () => {
  it('sends one save while the first is on its way', async () => {
    const { fixture, el, service, finish } = await render();
    const name = el.querySelector<HTMLInputElement>('#category-name');
    if (!name) throw new Error('no name field');
    name.value = 'Teas';
    name.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const save = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes(defaultAdminText.actions.save),
    );
    save?.click();
    fixture.detectChanges();
    save?.click();

    expect(service.create).toHaveBeenCalledTimes(1);
    expect(save?.textContent).toContain(defaultSharedText.actions.saving);
    finish();
    await fixture.whenStable();
  });

  it('shows the heading for a new category', async () => {
    const { el } = await render();
    expect(el.querySelector('h1')?.textContent).toContain(text.newTitle);
  });
});

describe('CategoryEditorPage on a category that is gone', () => {
  it('lets the admin leave without asking to discard anything', async () => {
    const { fixture } = await render('gone');

    expect(fixture.componentInstance.hasUnsavedChanges()).toBe(false);
  });
});
