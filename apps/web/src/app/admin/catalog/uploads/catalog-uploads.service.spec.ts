import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CatalogUploadsService } from './catalog-uploads.service';

describe('CatalogUploadsService', () => {
  let service: CatalogUploadsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CatalogUploadsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it.each([
    [false, '/api/media/catalog'],
    [true, '/api/media/catalog/square'],
  ])('posts a square=%s picture to %s', async (square, path) => {
    const file = new File(['bytes'], 'mark.png', { type: 'image/png' });
    const pair = { full: '/media/a.webp', thumb: '/media/b.webp' };

    const promise = service.uploadImage(file, square);
    const req = httpMock.expectOne((r) => r.url.endsWith(path));
    expect((req.request.body as FormData).get('file')).toBe(file);
    req.flush(pair);

    expect(await promise).toEqual(pair);
  });
});
